create index fleet_vehicles_org_primary_operator_idx
  on public.fleet_vehicles(organization_id, primary_operator_id)
  where primary_operator_id is not null;

create index fleet_service_records_created_by_idx
  on public.fleet_service_records(created_by);
