package com.mnelo.calls

import android.app.*
import android.content.*
import android.net.Uri
import android.os.*
import android.telecom.DisconnectCause
import android.media.Ringtone
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.telecom.*
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.RemoteMessage
import com.google.firebase.messaging.FirebaseMessagingService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.*
import java.util.UUID
import org.json.JSONObject

// Routing tokens/events are not logged. Telecom owns foreground execution/audio.
object MneloAndroidCalls {
  private val main = Handler(Looper.getMainLooper())
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var context: Context? = null
  private var manager: CallsManager? = null
  private var control: CallControlScope? = null
  private var live: String? = null
  private var video = false
  private var incoming = false
  private var active = false
  private var endpoints: List<CallEndpointCompat> = emptyList()
  private var ringing: Ringtone? = null
  private var timeout: Job? = null
  private val ended = mutableMapOf<String, Long>()
  private val endingReasons = mutableMapOf<String, String>()
  private val events = mutableListOf<Map<String, Any>>()
  var changed: (() -> Unit)? = null
  var token: String? = null
  var foreground = false
  private const val notificationId = 8127
  private const val channel = "mnelo-incoming-calls"
  private const val messageChannel = "mnelo-private-alerts"
  fun initialize(value: Context) {
    if (context != null) return
    context = value.applicationContext
    manager = CallsManager(value.applicationContext).also { it.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE or CallsManager.CAPABILITY_SUPPORTS_VIDEO_CALLING) }
    val notifications = value.getSystemService(NotificationManager::class.java)
    notifications.createNotificationChannel(NotificationChannel(channel, "Mnelo calls", NotificationManager.IMPORTANCE_HIGH).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE; setSound(null,null) })
    notifications.createNotificationChannel(NotificationChannel(messageChannel, "Mnelo", NotificationManager.IMPORTANCE_HIGH).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE })
    if (FirebaseApp.getApps(value).isNotEmpty()) FirebaseMessaging.getInstance().token.addOnSuccessListener { current -> token = current; emit(mapOf("type" to "token")) }
  }
  private fun emit(event: Map<String, Any>) { synchronized(events) { if(events.size >= 64) events.removeAt(0); events.add(event) }; changed?.invoke() }
  fun updateToken(value:String){token=value;emit(mapOf("type" to "token"))}
  fun drain(): List<Map<String, Any>> = synchronized(events) { val result=events.toList();events.clear();result }
  fun state(): Map<String, Any> = buildMap { put("environment","production");put("platform","android");token?.let { put("voipToken",it) };put("managedAudio",true) }
  private fun action(id:String,action:String,activity:Boolean=false): PendingIntent {
    val ctx=context!!
    val intent=if(activity)Intent(ctx,MneloIncomingCallActivity::class.java) else Intent(ctx,MneloCallActionReceiver::class.java)
    intent.action=action;intent.data=Uri.parse("mnelo-call:$id/$action");intent.putExtra("id",id)
    val flags=PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return if(activity)PendingIntent.getActivity(ctx,0,intent,flags) else PendingIntent.getBroadcast(ctx,0,intent,flags)
  }
  fun isVideoCall(id:String)=live==id && video
  private fun openApp():PendingIntent {
    val ctx=context!!
    val intent=ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!
    return PendingIntent.getActivity(ctx,1,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  fun notification(id:String): Notification {
    val ctx=context!!
    val end=action(id,"end")
    val person=Person.Builder().setName("Mnelo").setImportant(true).build()
    val builder=NotificationCompat.Builder(ctx,channel).setSmallIcon(ctx.applicationInfo.icon).setContentTitle(ctx.getString(if(active)R.string.mnelo_call_active else R.string.mnelo_call_incoming)).setCategory(NotificationCompat.CATEGORY_CALL).setOngoing(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(if(active)openApp() else action(id,"show",true))
    if(incoming && !active)builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person,end,action(id,"answer",true))).setFullScreenIntent(action(id,"show",true),true)
    else builder.setStyle(NotificationCompat.CallStyle.forOngoingCall(person,end))
    return builder.build()
  }
  fun add(id:String,isVideo:Boolean,isIncoming:Boolean) {
    val ctx=context?:return
    main.post {
      ended.entries.removeAll { it.value <= System.currentTimeMillis() }
      if(live==id || live!=null || ended.containsKey(id))return@post
      live=id;video=isVideo;incoming=isIncoming;active=false
      scope.launch {
        try {
          val attributes=CallAttributesCompat("Mnelo",Uri.parse("sip:mnelo"),if(isIncoming)CallAttributesCompat.DIRECTION_INCOMING else CallAttributesCompat.DIRECTION_OUTGOING,if(isVideo)CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL,0)
          manager!!.addCall(attributes,
            onAnswer={ answered(id) },
            onDisconnect={ val reason=endingReasons.remove(id)?:"local";cleanup(id);emit(mapOf("type" to "end","id" to id,"reason" to reason)) },
            onSetActive={ },
            onSetInactive={ throw IllegalStateException("CALL_HOLD_UNSUPPORTED") }
          ) {
            control=this
            ctx.getSystemService(NotificationManager::class.java).notify(notificationId,notification(id))
            launch { availableEndpoints.collect { endpoints=it } }
            launch { isMuted.collect { emit(mapOf("type" to "mute","id" to id,"muted" to it)) } }
            if(isIncoming){
              emit(mapOf("type" to "incoming","id" to id,"video" to isVideo))
              ringing=RingtoneManager.getRingtone(ctx,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)).also { if(Build.VERSION.SDK_INT>=28)it.isLooping=true;it.play() }
              val task=Intent(ctx,MneloCallTaskService::class.java).putExtra("id",id)
              // Only a user-visible Telecom incoming call may start this service.
              ctx.startForegroundService(task)
              HeadlessJsTaskService.acquireWakeLockNow(ctx)
            }
            // Answering is not a successful media connection. Only connected()
            // cancels this deadline, including while the phone is locked.
            timeout=scope.launch { delay(60000);if(live==id)end(id,"timeout") }
          }
        } catch (_: Exception) { cleanup(id);emit(mapOf("type" to "end","id" to id)) }
      }
    }
  }
  private fun answered(id:String) {
    if(live!=id)return
    ringing?.stop();ringing=null;active=true
    context?.getSystemService(NotificationManager::class.java)?.notify(notificationId,notification(id))
    emit(mapOf("type" to "answer","id" to id))
  }
  fun answer(id:String) { scope.launch { if(live==id){ val result=control?.answer(if(video)CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL);if(result is CallControlResult.Success)answered(id) else end(id) } } }
  fun connected(id:String) { scope.launch { if(live==id){ timeout?.cancel();ringing?.stop();ringing=null;active=true;if(!incoming)control?.setActive();context?.getSystemService(NotificationManager::class.java)?.notify(notificationId,notification(id)) } } }
  fun end(id:String,reason:String="local") { scope.launch {
    if(live!=id){ended[id]=System.currentTimeMillis()+120000;return@launch}
    endingReasons[id]=reason
    control?.disconnect(DisconnectCause(DisconnectCause.LOCAL))
    if(live==id){endingReasons.remove(id);cleanup(id);emit(mapOf("type" to "end","id" to id,"reason" to reason))}
  } }
  private fun cleanup(id:String) {
    ended[id]=System.currentTimeMillis()+120000
    if(live!=id)return
    timeout?.cancel();timeout=null;ringing?.stop();ringing=null;live=null;control=null;active=false
    context?.getSystemService(NotificationManager::class.java)?.cancel(notificationId)
    context?.stopService(Intent(context,MneloCallTaskService::class.java))
  }
  suspend fun speaker(enabled:Boolean) {
    val desired=endpoints.firstOrNull { it.type==if(enabled)CallEndpointCompat.TYPE_SPEAKER else CallEndpointCompat.TYPE_EARPIECE }?:throw IllegalStateException("AUDIO_ROUTE_UNAVAILABLE")
    if(control?.requestEndpointChange(desired) !is CallControlResult.Success)throw IllegalStateException("AUDIO_ROUTE_UNAVAILABLE")
  }
  fun message(id:String,missedCall:Boolean=false) {
    if(foreground)return
    val ctx=context?:return
    val intent=ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?:return
    val tap=PendingIntent.getActivity(ctx,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification=NotificationCompat.Builder(ctx,messageChannel).setSmallIcon(ctx.applicationInfo.icon).setContentTitle("Mnelo").setContentText(ctx.getString(if(missedCall)R.string.mnelo_call_missed else R.string.mnelo_message_new)).setContentIntent(tap).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
    try{ctx.getSystemService(NotificationManager::class.java).notify(id,0,notification)}catch(_:SecurityException){ }
  }
}
class MneloMessagingService: FirebaseMessagingService() {
  override fun onNewToken(token:String){MneloAndroidCalls.updateToken(token)}
  override fun onMessageReceived(message:RemoteMessage){
    val raw=message.data["mnelo"]?:return
    try {
      if(raw.length>1024)return
      MneloAndroidCalls.initialize(this)
      val payload=JSONObject(raw)
      if(payload.optInt("v")!=1)return
      val id=UUID.fromString(payload.getString("id")).toString()
      when(payload.getString("kind")){
        "message"->MneloAndroidCalls.message(id,payload.optString("reason")=="missed-call")
        "call"->{val expiry=payload.getLong("expires");if(expiry>System.currentTimeMillis() && expiry<=System.currentTimeMillis()+65000)MneloAndroidCalls.add(id,payload.getBoolean("video"),true)}
      }
    }catch(_:Exception){ /* Malformed provider events fail closed; never log a token/payload. */ }
  }
}
class MneloCallTaskService:HeadlessJsTaskService(){
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
    val id=intent?.getStringExtra("id")?:return START_NOT_STICKY
    startForeground(8127,MneloAndroidCalls.notification(id))
    return super.onStartCommand(intent,flags,startId)
  }
  override fun getTaskConfig(intent:Intent?):HeadlessJsTaskConfig?{
    val id=intent?.getStringExtra("id")?:return null
    return HeadlessJsTaskConfig("MneloIncomingCall",Arguments.createMap().apply{putString("id",id)},0,true)
  }
}
class MneloCallActionReceiver:BroadcastReceiver(){
  override fun onReceive(context:Context,intent:Intent){val id=intent.getStringExtra("id")?:return;MneloAndroidCalls.end(id)}
}
class MneloIncomingCallActivity:Activity(){
  private fun answerCall(id:String){
    if(MneloAndroidCalls.isVideoCall(id)) {
      packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
    }
    MneloAndroidCalls.answer(id)
    finish()
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
    val id=intent.getStringExtra("id")?:run{finish();return}
    if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true)}
    if(intent.action=="answer"){answerCall(id);return}
    val layout=android.widget.LinearLayout(this).apply{orientation=android.widget.LinearLayout.VERTICAL;gravity=android.view.Gravity.CENTER;setPadding(32,32,32,32)}
    layout.addView(android.widget.TextView(this).apply{text=getString(R.string.mnelo_call_incoming);textSize=28f;gravity=android.view.Gravity.CENTER})
    layout.addView(android.widget.Button(this).apply{text=getString(R.string.mnelo_call_answer);setOnClickListener{answerCall(id)}})
    layout.addView(android.widget.Button(this).apply{text=getString(R.string.mnelo_call_decline);setOnClickListener{MneloAndroidCalls.end(id);finish()}})
    setContentView(layout)
  }
}
class MneloCallsModule:Module(){
  override fun definition()=ModuleDefinition{
    Name("MneloCalls")
    Events("changed")
    OnCreate{appContext.reactContext?.let{MneloAndroidCalls.initialize(it)}}
    OnActivityEntersForeground{MneloAndroidCalls.foreground=true}
    OnActivityEntersBackground{MneloAndroidCalls.foreground=false}
    OnStartObserving{MneloAndroidCalls.changed={sendEvent("changed",emptyMap<String,Any>())}}
    OnStopObserving{MneloAndroidCalls.changed=null}
    AsyncFunction("state"){MneloAndroidCalls.state()}
    AsyncFunction("drain"){MneloAndroidCalls.drain()}
    AsyncFunction("incoming"){id:String,video:Boolean->MneloAndroidCalls.add(id,video,true)}
    AsyncFunction("outgoing"){id:String,video:Boolean->MneloAndroidCalls.add(id,video,false)}
    AsyncFunction("connected"){id:String->MneloAndroidCalls.connected(id)}
    AsyncFunction("answer"){id:String->MneloAndroidCalls.answer(id)}
    AsyncFunction("end"){id:String->MneloAndroidCalls.end(id)}
    AsyncFunction("speaker") Coroutine {enabled:Boolean-> withContext(Dispatchers.Main.immediate) { MneloAndroidCalls.speaker(enabled) } }
  }
}
