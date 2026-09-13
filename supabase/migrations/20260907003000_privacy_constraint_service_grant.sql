-- CHECK constraints also run for trusted maintenance writes. This pure validator grants no data access.
grant execute on function private.valid_coarse_area(text) to service_role;
