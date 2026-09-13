import { createContext, useContext } from 'react';

// The approved application is light. Calls alone have a dark presentation.
export const ScreenAppearance = createContext<'light' | 'call'>('light');
export const useCallAppearance = () => useContext(ScreenAppearance) === 'call';
