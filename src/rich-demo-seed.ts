type CoreData = {
  customers:any[]
  employees:any[]
  vehicles:any[]
  jobs:any[]
  assignments:any[]
}

type DemoUsers = { manager:{id:string}; operator:{id:string}; client:{id:string} }

const DAY = 24 * 60 * 60 * 1000
const at = (offset:number,hour=8,minute=0) => {
  const d = new Date(Date.now() + offset * DAY)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
const date = (offset:number) => at(offset,12).slice(0,10)
const moneyRound = (value:number) => Math.round(value * 100) / 100
const id = (kind:string,n:number) => 'demo-' + kind + '-' + String(n).padStart(3,'0')

export function createRichCoreSeed(orgId:string, operatorUserId:string): CoreData {
  const customerDefs = [
    ['Prairie Peak Energy','billing@prairiepeak.example','403-555-1101','Red Deer County, AB','Primary oilfield client. PO required on all field tickets.'],
    ['Aspen Ridge Midstream','ap@aspenridge.example','403-555-1102','Lacombe County, AB','Pipeline and facility maintenance work.'],
    ['Redline Civil & Utilities','accounts@redlinecivil.example','403-555-1103','Red Deer, AB','Municipal and civil daylighting projects.'],
    ['Foothills Environmental','billing@foothillsenv.example','403-555-1104','Rocky Mountain House, AB','Environmental cleanup and recovery support.'],
    ['Boreal Pipeline Services','payables@borealpipe.example','403-555-1105','Blackfalds, AB','Pipeline crossings and integrity digs.'],
    ['Clearwater Municipal Services','finance@clearwatermunicipal.example','403-555-1106','Central Alberta','Water, sewer and catch basin support.'],
    ['Ironwood Industrial','ap@ironwoodindustrial.example','403-555-1107','Joffre, AB','Plant shutdown and industrial vacuum work.'],
    ['Northstar Construction Group','billing@northstarbuild.example','403-555-1108','Sylvan Lake, AB','Construction excavation and winter steaming.'],
  ]
  const customers = customerDefs.map((row,index)=>({
    id:id('customer',index+1),organization_id:orgId,name:row[0],billing_email:row[1],phone:row[2],address:row[3],notes:row[4],status:'active'
  }))

  const employeeDefs = [
    ['Alex','Morgan','Operator','alex.morgan@northborn.example','403-555-2101','active'],
    ['Dylan','Carter','Operator','dylan.carter@northborn.example','403-555-2102','active'],
    ['Marcus','Hill','Swamper','marcus.hill@northborn.example','403-555-2103','active'],
    ['Jordan','Lee','Swamper','jordan.lee@northborn.example','403-555-2104','active'],
    ['Evan','Brooks','Class 3 Driver','evan.brooks@northborn.example','403-555-2105','active'],
    ['Cole','Bennett','Mechanic','cole.bennett@northborn.example','403-555-2106','active'],
    ['Ryan','Walker','Field Supervisor','ryan.walker@northborn.example','403-555-2107','active'],
    ['Sarah','Mitchell','Safety Coordinator','sarah.mitchell@northborn.example','403-555-2108','active'],
    ['Mason','Reed','Dispatcher','mason.reed@northborn.example','403-555-2109','active'],
    ['Noah','Campbell','Operator','noah.campbell@northborn.example','403-555-2110','leave'],
  ]
  const employees = employeeDefs.map((row,index)=>({
    id:id('employee',index+1),organization_id:orgId,user_id:index===0?operatorUserId:null,
    first_name:row[0],last_name:row[1],position:row[2],email:row[3],phone:row[4],status:row[5]
  }))

  const vehicleDefs:any[] = [
    ['101','Hydrovac 101','Hydrovac','NB101','assigned',2023,'Western Star','49X','White',84250,3120],
    ['102','Hydrovac 102','Hydrovac','NB102','available',2021,'Kenworth','T880','Blue',126400,4860],
    ['201','Combo Vac 201','Combo Vac','NB201','assigned',2022,'Peterbilt','567','White',99100,4015],
    ['202','Combo Vac 202','Combo Vac','NB202','available',2020,'Kenworth','T880','Black',153800,5980],
    ['301','Straight Vac 301','Straight Vac','NB301','available',2019,'Peterbilt','389','White',189500,7210],
    ['401','Water Truck 401','Water Truck','NB401','assigned',2022,'Freightliner','114SD','Blue',77400,2690],
    ['501','Steamer 501','Steamer','NB501','maintenance',2018,'Freightliner','M2','White',211300,8360],
    ['901','Crew Truck 901','Pickup','NB901','available',2024,'Ram','3500','Black',48200,1320],
  ]
  const vehicles = vehicleDefs.map((row,index)=>({
    id:id('vehicle',index+1),organization_id:orgId,unit_number:row[0],name:row[1],vehicle_type:row[2],plate:row[3],status:row[4],
    year:row[5],make:row[6],model:row[7],color:row[8],vin:'DEMO-VIN-' + row[0],odometer_km:row[9],engine_hours:row[10],
    primary_operator_id:index===0?employees[0].id:index===1?employees[1].id:null,
    registration_expiry:date(120+index*8),insurance_expiry:date(160+index*6),annual_inspection_expiry:date(45+index*12),
    notes:index===6?'Scheduled for burner pump repair.':'Demo fleet record with current operating history.',last_service_date:date(-18-index)
  }))

  const jobDefs:any[] = [
    [-112,'completed','Hydrovac daylighting for pipeline crossing',0,'North Compressor Site','Red Deer County, AB',0,2,0],
    [-101,'completed','Separator building tank cleanout',1,'Aspen Central Facility','Lacombe County, AB',2,3,2],
    [-89,'completed','Utility exposure for road crossing',2,'67 Street Upgrade','Red Deer, AB',1,2,1],
    [-77,'completed','Sump recovery and washdown',3,'Foothills Remediation Site','Rocky Mountain House, AB',2,4,2],
    [-66,'completed','Pipeline integrity dig daylighting',4,'Boreal Line 12','Blackfalds, AB',0,3,0],
    [-54,'completed','Sanitary manhole vacuum support',5,'West Collection Zone','Central Alberta',3,4,3],
    [-43,'completed','Turnaround combo vac support',6,'Ironwood Plant 2','Joffre, AB',1,2,2],
    [-31,'completed','Hydro excavation around electrical duct',0,'Prairie East Battery','Red Deer County, AB',0,3,0],
    [-20,'completed','Produced water vessel washout',1,'Aspen North Terminal','Lacombe County, AB',2,4,2],
    [-10,'completed','Catch basin cleaning program',2,'Downtown Phase 3','Red Deer, AB',3,4,3],
    [-4,'completed','Spill recovery and contaminated water transfer',3,'Foothills Lease 14','Rocky Mountain House, AB',2,3,2],
    [0,'in_progress','Hydrovac line locate and daylighting',0,'Prairie South Battery','Red Deer County, AB',0,2,0],
    [0,'dispatched','Pipeline exposure for NDE crew',4,'Boreal KP 44','Blackfalds, AB',1,3,1],
    [1,'scheduled','Potable water haul and tank fill',5,'Clearwater Reservoir','Central Alberta',4,2,5],
    [2,'dispatched','Combo vac facility cleanout',1,'Aspen West Compressor','Lacombe County, AB',1,3,2],
    [5,'scheduled','Trench daylighting for fiber crossing',2,'Highway 2A Project','Red Deer County, AB',0,2,0],
    [9,'scheduled','Steam thaw frozen culvert',7,'Northstar Subdivision','Sylvan Lake, AB',1,3,6],
    [14,'scheduled','Turnaround vacuum support',0,'Prairie Processing Plant','Red Deer County, AB',1,2,2],
    [21,'scheduled','Environmental recovery standby',3,'Foothills Response Base','Rocky Mountain House, AB',0,3,0],
    [30,'scheduled','Hydrovac crossing package',4,'Boreal Expansion West','Blackfalds, AB',1,2,1],
    [-15,'cancelled','Cancelled emergency water transfer',5,'Clearwater North','Central Alberta',4,3,5],
  ]
  const jobs = jobDefs.map((row,index)=>{
    const start=at(row[0],index%3===0?7:8,index%2?30:0)
    const completed=row[1]==='completed'
    const dispatched=['dispatched','in_progress'].includes(row[1])
    return {
      id:id('job',index+1),organization_id:orgId,customer_id:customers[row[3]].id,job_number:'NB-' + String(2601+index).padStart(4,'0'),
      title:row[2],site_name:row[4],site_address:row[5],scheduled_start:start,scheduled_end:at(row[0],17,0),
      shop_time:at(row[0],6,0),onsite_time:start,status:row[1],
      dispatch_stage:completed?'work_completed':row[1]==='in_progress'?'work_started':dispatched?'dispatched':row[1]==='cancelled'?'cancelled':'unassigned',
      completed_at:completed?at(row[0],16,30):null,dispatch_acknowledged_at:dispatched||completed?at(row[0],6,20):null,
      en_route_at:row[1]==='in_progress'||completed?at(row[0],6,45):null,onsite_at:row[1]==='in_progress'||completed?at(row[0],7,25):null,
      work_started_at:row[1]==='in_progress'||completed?at(row[0],7,35):null,work_completed_at:completed?at(row[0],16,15):null,
      dispatch_contact_name:'Mason Reed',dispatch_contact_phone:'403-555-2109',emergency_contact_name:'Ryan Walker',emergency_contact_phone:'403-555-2107',
      primary_operator_employee_id:employees[row[6]].id,notes:completed?'Completed safely. Ticket and timesheet submitted.':'Demo operations record with crew, unit and client details.'
    }
  })

  const assignments:any[] = []
  jobDefs.forEach((row,index)=>{
    if(row[1]==='cancelled')return
    const job=jobs[index],operator=employees[row[6]],swamper=employees[row[7]],vehicle=vehicles[row[8]]
    assignments.push({id:id('assignment',assignments.length+1),organization_id:orgId,job_id:job.id,employee_id:operator.id,vehicle_id:null,role:'operator'})
    assignments.push({id:id('assignment',assignments.length+1),organization_id:orgId,job_id:job.id,employee_id:swamper.id,vehicle_id:null,role:'swamper'})
    assignments.push({id:id('assignment',assignments.length+1),organization_id:orgId,job_id:job.id,employee_id:null,vehicle_id:vehicle.id,role:'unit'})
  })

  return {customers,employees,vehicles,jobs,assignments}
}

function assignedEmployee(core:CoreData,jobId:string){
  const a=core.assignments.find((row:any)=>row.job_id===jobId&&row.employee_id)
  return core.employees.find((row:any)=>row.id===a?.employee_id) || core.employees[0]
}
function assignedVehicle(core:CoreData,jobId:string){
  const a=core.assignments.find((row:any)=>row.job_id===jobId&&row.vehicle_id)
  return core.vehicles.find((row:any)=>row.id===a?.vehicle_id) || core.vehicles[0]
}

export function createRichDemoBundle(core:CoreData,orgId:string,users:DemoUsers){
  const completed=core.jobs.filter((job:any)=>job.status==='completed')
  const invoiceStatuses=['paid','paid','paid','paid','paid','paid','issued','partially_paid','overdue','draft']
  const invoices=completed.slice(0,10).map((job:any,index:number)=>{
    const customer=core.customers.find((row:any)=>row.id===job.customer_id)
    const subtotal=moneyRound(2400 + index*475 + (index%3)*850)
    const tax=moneyRound(subtotal*.05),total=moneyRound(subtotal+tax)
    const status=invoiceStatuses[index]
    const paid=status==='paid'?total:status==='partially_paid'?moneyRound(total*.55):0
    return {
      id:id('invoice',index+1),organization_id:orgId,customer_id:job.customer_id,job_id:job.id,invoice_number:'INV-2026-' + String(1001+index),
      status,invoice_date:String(job.scheduled_start).slice(0,10),due_date:date(-82+index*11),purchase_order:'PO-' + String(7710+index),
      afe_number:index%2===0?'AFE-' + String(4400+index):null,project:job.title,location:job.site_address,area:job.site_name,
      job_description:job.title + '. Work completed and signed field ticket attached.',billed_to_name:customer?.name||'Client',
      billed_to_address:customer?.address||null,billed_to_email:customer?.billing_email||null,seller_name:'Northborn Test Company',
      seller_address:'Central Alberta',seller_phone:'403-555-2000',seller_email:'billing@northborn.example',gst_number:'DEMO-GST-123456789',
      permit_number:'DEMO-PERMIT',wcb_number:'DEMO-WCB',currency_code:'CAD',tax_rate:5,subtotal,tax_total:tax,total,
      amount_paid:paid,credit_total:0,balance_due:moneyRound(total-paid),approval_status:status==='draft'?'submitted':'approved',
      approval_note:status==='draft'?'Waiting for manager approval.':null,notes:index%3===0?'Net 30. PO shown above.':null,terms:'Net 30',
      sent_count:status==='draft'?0:1,last_sent_at:status==='draft'?null:at(-Math.max(1,90-index*9),10),last_delivery_error:null,
      created_at:at(-110+index*10,17),updated_at:at(-105+index*10,9),
      line_items:[
        {id:id('invoice-line',index*3+1),category:'equipment',description:index%2===0?'Hydrovac unit':'Combo / vacuum unit',quantity:8+(index%3),unit:'hour',rate:285,amount:(8+(index%3))*285,sort_order:0},
        {id:id('invoice-line',index*3+2),category:'labour',description:'Swamper / field labour',quantity:8+(index%2),unit:'hour',rate:95,amount:(8+(index%2))*95,sort_order:1},
        {id:id('invoice-line',index*3+3),category:'transport',description:'Mobilization',quantity:1,unit:'flat',rate:325,amount:325,sort_order:2},
      ]
    }
  })
  const invoiceByJob=new Map(invoices.filter((row:any)=>row.status!=='draft').map((row:any)=>[row.job_id,row.id]))

  const ticketStatuses=['approved','approved','approved','approved','approved','approved','approved','approved','approved','submitted','approved']
  const fieldTickets=completed.map((job:any,index:number)=>{
    const employee=assignedEmployee(core,job.id),vehicle=assignedVehicle(core,job.id)
    const invoiceId=invoiceByJob.get(job.id)||null
    return {
      id:id('ticket',index+1),organization_id:orgId,job_id:job.id,customer_id:job.customer_id,primary_employee_id:employee.id,vehicle_id:vehicle.id,
      invoice_id:invoiceId,ticket_number:'FT-2026-' + String(3101+index),ticket_type:vehicle.vehicle_type==='Hydrovac'?'hydrovac':vehicle.vehicle_type==='Water Truck'?'water':'vacuum',
      work_date:String(job.scheduled_start).slice(0,10),site_name:job.site_name,site_address:job.site_address,purchase_order:'PO-' + String(7710+index),
      afe_number:index%2===0?'AFE-' + String(4400+index):null,start_time:'07:00',end_time:'17:00',travel_hours:index%3===0?2:1.25,
      work_hours:8+(index%3===1?1:0),standby_hours:index%4===0?0.5:0,quantity:8,quantity_unit:'hour',
      disposal_location:index%3===1?'Central Alberta Disposal Facility':null,disposal_manifest:index%3===1?'DM-' + String(8300+index):null,
      work_description:job.title + ' completed as requested.',operator_notes:index%4===0?'Site conditions wet. Extra setup time recorded.':'No operational issues.',
      customer_signed_by:['Chris Taylor','Morgan Bell','Jamie Ross','Pat Singh'][index%4],customer_signature_data:'demo-signature',
      customer_signed_at:at(-Math.max(2,108-index*10),16),status:ticketStatuses[index]||'approved',
      submitted_at:at(-Math.max(2,108-index*10),17),reviewed_at:ticketStatuses[index]==='approved'?at(-Math.max(1,107-index*10),9):null,
      reviewed_by:ticketStatuses[index]==='approved'?users.manager.id:null,review_note:null,created_by:users.operator.id,
      created_at:at(-Math.max(2,109-index*10),16),updated_at:at(-Math.max(1,107-index*10),9),template_id:'demo-template-field-ticket',template_version:3,
      custom_answers:{ground_disturbance_complete:true,utility_owner:index%2===0?'Prairie Utility Locate':'Client supplied'},operator_signature_data:'demo-operator-signature',operator_signed_at:at(-Math.max(2,108-index*10),16)
    }
  })
  const fieldTicketItems=fieldTickets.flatMap((ticket:any,index:number)=>[
    {id:id('ticket-item',index*3+1),organization_id:orgId,ticket_id:ticket.id,price_item_id:'demo-price-001',category:'equipment',description:'Hydrovac / vacuum unit',quantity:8+(index%3),unit:'hour',rate_snapshot:285,sort_order:0,notes:null},
    {id:id('ticket-item',index*3+2),organization_id:orgId,ticket_id:ticket.id,price_item_id:'demo-price-006',category:'labour',description:'Swamper / field labour',quantity:8,unit:'hour',rate_snapshot:95,sort_order:1,notes:null},
    {id:id('ticket-item',index*3+3),organization_id:orgId,ticket_id:ticket.id,price_item_id:'demo-price-009',category:'transport',description:'Mobilization',quantity:1,unit:'flat',rate_snapshot:325,sort_order:2,notes:null},
  ])

  const recentJobs=core.jobs.filter((job:any)=>job.status!=='cancelled').slice(6,18)
  const timesheets:any[]=[]
  recentJobs.forEach((job:any,index:number)=>{
    const assigned=core.assignments.filter((row:any)=>row.job_id===job.id&&row.employee_id).slice(0,2)
    assigned.forEach((assignment:any,crewIndex:number)=>{
      const status=index>=9&&crewIndex===1?'submitted':index===11&&crewIndex===0?'draft':'approved'
      timesheets.push({
        id:id('timesheet',timesheets.length+1),organization_id:orgId,employee_id:assignment.employee_id,job_id:job.id,
        work_date:String(job.scheduled_start).slice(0,10),start_time:'06:30',end_time:index%3===0?'18:00':'17:00',break_minutes:30,
        regular_hours:8,overtime_hours:index%3===0?3:1.5,notes:index%4===0?'Travel and site setup included.':null,status,
        submitted_at:status==='draft'?null:at(-Math.max(0,40-index*4),18),reviewed_at:status==='approved'?at(-Math.max(0,39-index*4),9):null,
        reviewed_by:status==='approved'?users.manager.id:null,review_note:null,created_by:assignment.employee_id,
        created_at:at(-Math.max(0,40-index*4),18),updated_at:at(-Math.max(0,39-index*4),9),template_id:'demo-template-timesheet',template_version:2,
        custom_answers:{meal_break_taken:true},employee_signature_data:'demo-signature',employee_signed_at:status==='draft'?null:at(-Math.max(0,40-index*4),18)
      })
    })
  })

  const programs=[
    {id:'demo-maint-program-1',organization_id:orgId,name:'250 Hour Service',description:'Engine oil, filters, grease and inspection.',service_type:'Oil & Filters',interval_km:null,interval_engine_hours:250,interval_days:null,warning_km:500,warning_engine_hours:25,warning_days:7,active:true},
    {id:'demo-maint-program-2',organization_id:orgId,name:'10,000 km Chassis Service',description:'Chassis grease, driveline, brake and tire inspection.',service_type:'Preventive Service',interval_km:10000,interval_engine_hours:null,interval_days:null,warning_km:1000,warning_engine_hours:25,warning_days:7,active:true},
    {id:'demo-maint-program-3',organization_id:orgId,name:'Annual CVIP',description:'Commercial vehicle inspection program.',service_type:'Inspection',interval_km:null,interval_engine_hours:null,interval_days:365,warning_km:500,warning_engine_hours:25,warning_days:45,active:true},
    {id:'demo-maint-program-4',organization_id:orgId,name:'Vacuum Pump Service',description:'Inspect oil, belts, seals and operating temperatures.',service_type:'Preventive Service',interval_km:null,interval_engine_hours:500,interval_days:null,warning_km:500,warning_engine_hours:50,warning_days:14,active:true},
  ]
  const maintenanceAssignments=core.vehicles.flatMap((vehicle:any,index:number)=>[
    {id:id('maint-assignment',index*2+1),organization_id:orgId,program_id:programs[0].id,vehicle_id:vehicle.id,active:true,last_completed_date:date(-18-index),last_completed_odometer_km:vehicle.odometer_km-2200,last_completed_engine_hours:vehicle.engine_hours-210,next_due_date:null,next_due_odometer_km:null,next_due_engine_hours:vehicle.engine_hours+(index===6?-30:40+index*18)},
    {id:id('maint-assignment',index*2+2),organization_id:orgId,program_id:programs[2].id,vehicle_id:vehicle.id,active:true,last_completed_date:date(-280+index*6),last_completed_odometer_km:vehicle.odometer_km-18000,last_completed_engine_hours:vehicle.engine_hours-600,next_due_date:date(35+index*12),next_due_odometer_km:null,next_due_engine_hours:null},
  ])
  const defects=[
    {id:'demo-defect-1',organization_id:orgId,vehicle_id:core.vehicles[6].id,title:'Burner fuel pump intermittent',description:'Burner occasionally fails to maintain flame under load.',severity:'high',status:'open',out_of_service:true,reported_at:at(-2,14),resolved_at:null,resolution_notes:null,odometer_km:core.vehicles[6].odometer_km,engine_hours:core.vehicles[6].engine_hours,report_count:2},
    {id:'demo-defect-2',organization_id:orgId,vehicle_id:core.vehicles[2].id,title:'Passenger work light out',description:'Rear passenger-side LED work light inoperative.',severity:'low',status:'open',out_of_service:false,reported_at:at(-1,7),resolved_at:null,resolution_notes:null,odometer_km:core.vehicles[2].odometer_km,engine_hours:core.vehicles[2].engine_hours,report_count:1},
    {id:'demo-defect-3',organization_id:orgId,vehicle_id:core.vehicles[0].id,title:'Vacuum hose wear at coupling',description:'Outer jacket showing wear. Replaced before next shift.',severity:'medium',status:'resolved',out_of_service:false,reported_at:at(-24,16),resolved_at:at(-23,11),resolution_notes:'Replaced damaged hose section and inspected adjacent couplings.',odometer_km:core.vehicles[0].odometer_km-1300,engine_hours:core.vehicles[0].engine_hours-65,report_count:1},
    {id:'demo-defect-4',organization_id:orgId,vehicle_id:core.vehicles[3].id,title:'Air leak at gladhand',description:'Slow air leak noted during post-trip.',severity:'medium',status:'resolved',out_of_service:false,reported_at:at(-48,18),resolved_at:at(-47,8),resolution_notes:'Seal replaced and leak test passed.',odometer_km:core.vehicles[3].odometer_km-4100,engine_hours:core.vehicles[3].engine_hours-160,report_count:1},
    {id:'demo-defect-5',organization_id:orgId,vehicle_id:core.vehicles[4].id,title:'Backup alarm intermittent',description:'Alarm failed once during pre-trip and passed on retest.',severity:'high',status:'resolved',out_of_service:true,reported_at:at(-72,6),resolved_at:at(-72,10),resolution_notes:'Loose connector repaired. Function verified.',odometer_km:core.vehicles[4].odometer_km-7200,engine_hours:core.vehicles[4].engine_hours-280,report_count:1},
  ]
  const inspections:any[]=Array.from({length:18},(_,index)=>{
    const vehicle=core.vehicles[index%core.vehicles.length]
    const isAttention=index===1||index===11
    return {
      id:id('inspection',index+1),organization_id:orgId,vehicle_id:vehicle.id,inspection_type:index%7===0?'post_trip':'pre_trip',
      inspection_name:null,inspected_at:at(-index*3,6,15),odometer_km:Math.max(0,vehicle.odometer_km-index*220),engine_hours:Math.max(0,vehicle.engine_hours-index*9),
      result:isAttention?'attention':'pass',notes:isAttention?'Minor defect reported and linked to maintenance.':'No defects noted. Unit safe to operate.'
    }
  })
  inspections.push({id:'demo-inspection-cvip',organization_id:orgId,vehicle_id:core.vehicles[1].id,inspection_type:'cvip',inspection_name:'Annual CVIP',inspected_at:at(-42,10),odometer_km:core.vehicles[1].odometer_km-3800,engine_hours:core.vehicles[1].engine_hours-125,result:'pass',notes:'Passed annual inspection.'})
  const workOrders=[
    {id:'demo-wo-1',organization_id:orgId,vehicle_id:core.vehicles[0].id,maintenance_assignment_id:maintenanceAssignments[0].id,source_defect_id:null,work_order_number:'WO-26041',title:'250 hour service',description:'Oil, filters, grease and full visual inspection.',priority:'normal',status:'completed',assigned_employee_id:core.employees[5].id,vendor:null,scheduled_date:date(-18),started_at:at(-18,8),completed_at:at(-18,14),completed_odometer_km:core.vehicles[0].odometer_km-2200,completed_engine_hours:core.vehicles[0].engine_hours-210,labour_cost_cents:48000,parts_cost_cents:61200,external_cost_cents:0,downtime_minutes:360,completion_notes:'Service completed. No additional defects.',created_at:at(-20,9)},
    {id:'demo-wo-2',organization_id:orgId,vehicle_id:core.vehicles[2].id,maintenance_assignment_id:null,source_defect_id:'demo-defect-2',work_order_number:'WO-26056',title:'Replace rear work light',description:'Replace failed LED assembly and test circuits.',priority:'low',status:'scheduled',assigned_employee_id:core.employees[5].id,vendor:null,scheduled_date:date(2),started_at:null,completed_at:null,completed_odometer_km:null,completed_engine_hours:null,labour_cost_cents:0,parts_cost_cents:0,external_cost_cents:0,downtime_minutes:0,completion_notes:null,created_at:at(-1,8)},
    {id:'demo-wo-3',organization_id:orgId,vehicle_id:core.vehicles[6].id,maintenance_assignment_id:null,source_defect_id:'demo-defect-1',work_order_number:'WO-26057',title:'Diagnose steamer burner fuel system',description:'Intermittent burner fuel pressure / flame loss.',priority:'high',status:'in_progress',assigned_employee_id:core.employees[5].id,vendor:'Central Alberta Burner Service',scheduled_date:date(0),started_at:at(0,8),completed_at:null,completed_odometer_km:null,completed_engine_hours:null,labour_cost_cents:32000,parts_cost_cents:0,external_cost_cents:45000,downtime_minutes:360,completion_notes:null,created_at:at(-2,15)},
    {id:'demo-wo-4',organization_id:orgId,vehicle_id:core.vehicles[3].id,maintenance_assignment_id:null,source_defect_id:'demo-defect-4',work_order_number:'WO-26018',title:'Repair air leak',description:'Replace gladhand seal and pressure test.',priority:'normal',status:'completed',assigned_employee_id:core.employees[5].id,vendor:null,scheduled_date:date(-47),started_at:at(-47,7),completed_at:at(-47,9),completed_odometer_km:core.vehicles[3].odometer_km-4100,completed_engine_hours:core.vehicles[3].engine_hours-160,labour_cost_cents:16000,parts_cost_cents:3500,external_cost_cents:0,downtime_minutes:120,completion_notes:'Passed leak test.',created_at:at(-48,19)},
    {id:'demo-wo-5',organization_id:orgId,vehicle_id:core.vehicles[4].id,maintenance_assignment_id:null,source_defect_id:'demo-defect-5',work_order_number:'WO-25994',title:'Backup alarm electrical repair',description:'Trace intermittent alarm circuit.',priority:'high',status:'completed',assigned_employee_id:core.employees[5].id,vendor:null,scheduled_date:date(-72),started_at:at(-72,8),completed_at:at(-72,10),completed_odometer_km:core.vehicles[4].odometer_km-7200,completed_engine_hours:core.vehicles[4].engine_hours-280,labour_cost_cents:21000,parts_cost_cents:4200,external_cost_cents:0,downtime_minutes:120,completion_notes:'Connector repaired and alarm verified.',created_at:at(-72,7)},
  ]
  const fleetDocuments=core.vehicles.slice(0,6).flatMap((vehicle:any,index:number)=>[
    {id:id('fleet-document',index*2+1),organization_id:orgId,vehicle_id:vehicle.id,document_type:'registration',name:'Registration - Unit ' + vehicle.unit_number,storage_path:'demo/fleet/' + vehicle.unit_number + '/registration.pdf',mime_type:'application/pdf',file_size:185000,expiry_date:vehicle.registration_expiry,notes:null,created_at:at(-95+index)},
    {id:id('fleet-document',index*2+2),organization_id:orgId,vehicle_id:vehicle.id,document_type:'insurance',name:'Insurance - Unit ' + vehicle.unit_number,storage_path:'demo/fleet/' + vehicle.unit_number + '/insurance.pdf',mime_type:'application/pdf',file_size:214000,expiry_date:vehicle.insurance_expiry,notes:null,created_at:at(-90+index)},
  ])
  const maintenance={programs,assignments:maintenanceAssignments,defects,inspections,workOrders,documents:fleetDocuments}

  const credentialTypes=[
    ['h2s','H2S Alive','Energy Safety Canada',180],['first_aid','Standard First Aid / CPR','St. John Ambulance',220],
    ['ground_disturbance','Ground Disturbance Level II','Global Training Centre',300],['confined_space','Confined Space Entry','Energy Safety Canada',140],
    ['whmis','WHMIS 2015','Company Training',330],['tdg','Transportation of Dangerous Goods','Company Training',250],
  ]
  const credentials:any[]=core.employees.filter((employee:any)=>employee.status==='active').flatMap((employee:any,employeeIndex:number)=>
    credentialTypes.slice(0,employeeIndex%3===0?6:4).map((row:any,typeIndex:number)=>({
      id:id('credential',employeeIndex*10+typeIndex+1),organization_id:orgId,employee_id:employee.id,credential_type:row[0],title:row[1],issuer:row[2],
      credential_number:'DEMO-' + String(employeeIndex+1) + '-' + String(typeIndex+1),issued_on:date(-365+employeeIndex*9+typeIndex*5),
      expires_on:date(row[3]-employeeIndex*11-typeIndex*7),status:employeeIndex===3&&typeIndex===2?'pending':'verified',
      file_path:'demo/safety/credentials/' + employee.id + '-' + row[0] + '.pdf',notes:null,uploaded_by:users.manager.id,
      verified_by:employeeIndex===3&&typeIndex===2?null:users.manager.id,verified_at:employeeIndex===3&&typeIndex===2?null:at(-20+employeeIndex),
      created_at:at(-80+employeeIndex*3),updated_at:at(-20+employeeIndex)
    }))
  )
  credentials.push({id:'demo-credential-expired',organization_id:orgId,employee_id:core.employees[4].id,credential_type:'orientation',title:'Ironwood Site Orientation',issuer:'Ironwood Industrial',credential_number:'IW-OR-5541',issued_on:date(-410),expires_on:date(-8),status:'verified',file_path:'demo/safety/credentials/expired-orientation.pdf',notes:'Renew before next Ironwood assignment.',uploaded_by:users.manager.id,verified_by:users.manager.id,verified_at:at(-400),created_at:at(-410),updated_at:at(-400)})
  const safetyDocs=[
    ['sds','Hydrogen Sulfide (H2S) SDS',['h2s','gas','sds']],
    ['sds','Diesel Fuel SDS',['diesel','fuel','sds']],
    ['sds','Gasoline SDS',['gasoline','fuel','sds']],
    ['sds','Methanol SDS',['methanol','chemical','sds']],
    ['sds','Sodium Hypochlorite SDS',['bleach','chemical','sds']],
    ['sds','Engine Coolant / Antifreeze SDS',['coolant','chemical','sds']],
    ['sds','Hydraulic Oil SDS',['hydraulic','oil','sds']],
    ['sds','Varsol / Parts Solvent SDS',['solvent','shop','sds']],
    ['sop','Hydrovac Safe Operating Procedure',['hydrovac','sop']],
    ['sop','Vacuum Truck Loading and Unloading SOP',['vacuum','sop']],
    ['safe_work_practice','Ground Disturbance Safe Work Practice',['ground disturbance','swp']],
    ['emergency_plan','Emergency Response Plan - Field Operations',['erp','emergency']],
  ].map((row:any,index:number)=>({
    id:id('safety-document',index+1),organization_id:orgId,category:row[0],title:row[1],description:'Current controlled demo document for Northborn testing.',
    tags:row[2],version:index<8?'2026.1':'3.0',effective_date:date(-110+index*4),review_date:date(250+index*7),status:'active',
    file_path:'demo/safety/library/document-' + String(index+1) + '.pdf',created_by:users.manager.id,created_at:at(-115+index*4),updated_at:at(-20+index),
    expires_on:null,requires_acknowledgement:index>=8,supersedes_document_id:null,revision_notes:index>=8?'Annual content review completed.':null
  }))
  const safetyFormTypes=['flha','flha','toolbox_talk','hazard_observation','near_miss','flha','vehicle_equipment_inspection','incident_report','flha','toolbox_talk','near_miss','flha','hazard_observation','incident_report','flha','vehicle_equipment_inspection','toolbox_talk','flha']
  const safetySubmissions=safetyFormTypes.map((type,index)=>{
    const job=core.jobs[Math.min(index,core.jobs.length-2)],employee=core.employees[index%7]
    const reviewed=index%5!==4
    const titleMap:any={flha:'FLHA - ' + job.site_name,incident_report:'Incident Report - ' + job.site_name,near_miss:'Near Miss - ' + job.site_name,hazard_observation:'Hazard Observation - ' + job.site_name,toolbox_talk:'Toolbox Talk - ' + job.site_name,vehicle_equipment_inspection:'Vehicle / Equipment Inspection'}
    const answers:any={work_area:job.site_name,task:job.title,hazards:'Traffic, overhead lines, stored energy, slips/trips and moving equipment.',controls:'Barricades, spotter, utility locates, PPE, safe approach distances and pre-job communication.'}
    if(type==='incident_report')Object.assign(answers,{incident_at:at(-8-index*5,11),incident_type:index%2?'equipment_damage':'minor_spill',description:index%2?'Minor mirror contact while backing at low speed. No injury.':'Small hydraulic seep discovered during setup and contained immediately.',immediate_action:'Work stopped, area secured, supervisor notified and corrective action completed.',injury:false})
    if(type==='near_miss')Object.assign(answers,{description:'Spotter identified unexpected vehicle movement before entering the work zone.',potential_outcome:'Possible struck-by exposure.',corrective_action:'Traffic control repositioned and exclusion zone expanded.'})
    return {id:id('safety-submission',index+1),organization_id:orgId,employee_id:employee.id,job_id:job.id,form_type:type,title:titleMap[type],answers,status:reviewed?'reviewed':'submitted',submitted_by:users.operator.id,submitted_at:at(-Math.max(0,100-index*6),7),reviewed_by:reviewed?users.manager.id:null,reviewed_at:reviewed?at(-Math.max(0,99-index*6),9):null,review_notes:reviewed?'Reviewed. No further action required.':null,created_at:at(-Math.max(0,100-index*6),7),updated_at:reviewed?at(-Math.max(0,99-index*6),9):at(-Math.max(0,100-index*6),7)}
  })

  const priceItems=[
    ['Hydrovac','equipment','hour',285,4],['Combo Vac','equipment','hour',310,4],['Straight Vac','equipment','hour',235,4],
    ['Steamer','equipment','hour',210,4],['Water Truck','equipment','hour',185,4],['Swamper','labour','hour',95,4],
    ['Disposal','disposal','load',425,1],['Overtime Premium','overtime','hour',65,0],['Mobilization','transport','flat',325,1],
    ['Crew Truck','transport','day',175,1],['Potable Water','material','m³',38,1],['Emergency Callout','other','flat',450,1],
  ].map((row:any,index:number)=>({id:'demo-price-' + String(index+1).padStart(3,'0'),organization_id:orgId,name:row[0],category:row[1],unit:row[2],default_rate:row[3],minimum_quantity:row[4],is_active:true,sort_order:index,created_by:users.manager.id,created_at:at(-120)}))
  const overrides=[
    {id:'demo-override-1',organization_id:orgId,customer_id:core.customers[0].id,price_item_id:priceItems[0].id,rate:270},
    {id:'demo-override-2',organization_id:orgId,customer_id:core.customers[0].id,price_item_id:priceItems[5].id,rate:90},
    {id:'demo-override-3',organization_id:orgId,customer_id:core.customers[1].id,price_item_id:priceItems[1].id,rate:295},
    {id:'demo-override-4',organization_id:orgId,customer_id:core.customers[6].id,price_item_id:priceItems[6].id,rate:390},
  ]

  const templateDefs:any[]=[
    ['demo-template-field-ticket','Hydrovac Field Ticket','field_ticket',true,3],
    ['demo-template-combo-ticket','Vacuum / Combo Ticket','field_ticket',false,2],
    ['demo-template-timesheet','Daily Timesheet','timesheet',true,2],
    ['demo-template-flha','Field Level Hazard Assessment','flha',true,4],
    ['demo-template-pretrip','Commercial Vehicle Pre Trip','pre_trip',true,3],
    ['demo-template-incident','Incident Report','incident_report',true,2],
    ['demo-template-workorder','Fleet Work Order','work_order',true,1],
    ['demo-template-invoice','Customer Invoice','invoice',true,2],
  ]
  const templates=templateDefs.map((row,index)=>({
    id:row[0],organization_id:orgId,name:row[1],document_type:row[2],source_kind:'northborn_builder',description:'Active Northborn demo template used in day-to-day operations.',
    status:'active',is_default:row[3],version:row[4],file_path:null,original_file_name:null,page_count:null,
    fields:[
      {id:id('template-field',index*3+1),key:'job_number',label:'Job number',type:'text',required:true,binding:'job.job_number',source:'preset',section:'Job'},
      {id:id('template-field',index*3+2),key:'employee_name',label:'Employee',type:'text',required:false,binding:'employee.full_name',source:'preset',section:'People'},
      {id:id('template-field',index*3+3),key:'signature',label:'Signature',type:'signature',required:true,binding:'employee.signature',source:'preset',section:'Approval'},
    ],
    settings:{paper_size:'letter'},created_by:users.manager.id,updated_by:users.manager.id,published_at:at(-70+index*3),created_at:at(-100+index*2),updated_at:at(-20+index)
  }))

  const contacts=core.customers.flatMap((customer:any,index:number)=>[
    {id:id('contact',index*2+1),organization_id:orgId,customer_id:customer.id,name:['Chris Taylor','Morgan Bell','Jamie Ross','Pat Singh','Taylor Chen','Robin Clarke','Jordan Smith','Casey Brown'][index],title:'Field Supervisor',phone:'403-555-' + String(3101+index),email:'field' + String(index+1) + '@client.example',contact_type:'field',notes:'Primary on-site contact.',status:'active',created_at:at(-120+index),updated_at:at(-30+index)},
    {id:id('contact',index*2+2),organization_id:orgId,customer_id:customer.id,name:['Avery Scott','Sam Patel','Riley Green','Drew Wilson','Cameron Hall','Alexis King','Parker Young','Quinn Adams'][index],title:'Accounts Payable',phone:'403-555-' + String(3201+index),email:'ap' + String(index+1) + '@client.example',contact_type:'billing',notes:'Billing and PO contact.',status:'active',created_at:at(-118+index),updated_at:at(-25+index)},
  ])

  const notifications=[
    {id:'demo-notification-1',organization_id:orgId,recipient_user_id:users.manager.id,notification_type:'ticket_submitted',title:'Field ticket ready for review',message:fieldTickets.find((row:any)=>row.status==='submitted')?.ticket_number + ' was submitted by the field crew.',entity_type:'field_ticket',entity_id:fieldTickets.find((row:any)=>row.status==='submitted')?.id,payload:{},read_at:null,created_at:at(-1,17)},
    {id:'demo-notification-2',organization_id:orgId,recipient_user_id:users.manager.id,notification_type:'fleet_defect',title:'High priority fleet defect',message:'Unit 501 was placed out of service for burner fuel system diagnosis.',entity_type:'fleet',entity_id:core.vehicles[6].id,payload:{},read_at:null,created_at:at(-2,15)},
    {id:'demo-notification-3',organization_id:orgId,recipient_user_id:users.manager.id,notification_type:'safety_submission',title:'Safety form awaiting review',message:'A recent safety submission still needs manager review.',entity_type:'safety',entity_id:safetySubmissions.find((row:any)=>row.status==='submitted')?.id,payload:{},read_at:null,created_at:at(-3,9)},
    {id:'demo-notification-4',organization_id:orgId,recipient_user_id:users.manager.id,notification_type:'invoice_overdue',title:'Invoice overdue',message:'INV-2026-1009 is overdue and still outstanding.',entity_type:'invoice',entity_id:invoices.find((row:any)=>row.status==='overdue')?.id,payload:{},read_at:at(-1,10),created_at:at(-6,8)},
    {id:'demo-notification-5',organization_id:orgId,recipient_user_id:users.manager.id,notification_type:'credential_expiry',title:'Worker ticket expired',message:'One worker orientation requires renewal.',entity_type:'safety',entity_id:'demo-credential-expired',payload:{},read_at:at(-5,12),created_at:at(-8,7)},
  ]

  const customerPortalInvites=[
    {id:'demo-client-invite-1',organization_id:orgId,customer_id:core.customers[2].id,email:'project.manager@redline.example',portal_role:'viewer',invite_code:'NB-RDLN2601',status:'pending',expires_at:at(5),delivery_status:'sent',delivery_error:null,created_at:at(-2)},
    {id:'demo-client-invite-2',organization_id:orgId,customer_id:core.customers[4].id,email:'billing@boreal.example',portal_role:'billing',invite_code:'NB-BRLP2602',status:'accepted',expires_at:at(20),delivery_status:'sent',delivery_error:null,created_at:at(-24)},
  ]
  const organizationInvites=[
    {id:'demo-team-invite-1',organization_id:orgId,email:'new.operator@northborn.example',status:'pending',expires_at:at(5),created_at:at(-2),invite_token:'demo-token-1',role:{key:'operator',name:'Operator'}},
    {id:'demo-team-invite-2',organization_id:orgId,email:'new.swamper@northborn.example',status:'pending',expires_at:at(6),created_at:at(-1),invite_token:'demo-token-2',role:{key:'operator',name:'Operator'}},
  ]
  const accessProfiles=core.employees.slice(0,6).map((employee:any,index:number)=>({id:id('fleet-access',index+1),organization_id:orgId,employee_id:employee.id,access_level:index<2?'operator':index===5?'mechanic':'viewer',can_report_defects:true,can_update_odometer:index<3,created_at:at(-90+index)}))

  const generic:any = {
    field_tickets:fieldTickets,
    field_ticket_items:fieldTicketItems,
    timesheet_entries:timesheets,
    invoices,
    fleet_maintenance_programs:programs,
    fleet_maintenance_assignments:maintenanceAssignments,
    fleet_defects:defects,
    fleet_inspections:inspections,
    fleet_work_orders:workOrders,
    fleet_documents:fleetDocuments,
    safety_credentials:credentials,
    safety_documents:safetyDocs,
    safety_form_submissions:safetySubmissions,
    price_sheet_items:priceItems,
    customer_price_overrides:overrides,
    document_templates:templates,
    customer_contacts:contacts,
    customer_portal_invites:customerPortalInvites,
    organization_invites:organizationInvites,
    employee_fleet_access_profiles:accessProfiles,
    user_notifications:notifications,
  }

  const clientRequests=[
    {request_id:'demo-request-1',title:'Hydrovac daylighting at new meter run',requested_start:at(8,8),site_name:'Prairie North Meter Station',site_address:'Red Deer County, AB',onsite_contact_id:null,onsite_contact_name:'Chris Taylor',client_notes:'Please confirm crew the day before.',status:'pending',linked_job_id:null,created_at:at(-2)},
    {request_id:'demo-request-2',title:'Vac truck support for vessel entry',requested_start:at(18,7),site_name:'Prairie East Battery',site_address:'Red Deer County, AB',onsite_contact_id:null,onsite_contact_name:'Chris Taylor',client_notes:'Permit package will be supplied.',status:'approved',linked_job_id:core.jobs[17]?.id||null,created_at:at(-12)},
  ]

  const portalContacts=[
    {id:'demo-portal-contact-1',name:'Chris Taylor',title:'Field Supervisor',phone:'403-555-3101',email:'field1@client.example',contact_type:'field',status:'active',updated_at:at(-3)},
    {id:'demo-portal-contact-2',name:'Avery Scott',title:'Accounts Payable',phone:'403-555-3201',email:'ap1@client.example',contact_type:'billing',status:'active',updated_at:at(-8)},
    {id:'demo-portal-contact-3',name:'Devon Price',title:'Operations Lead',phone:'403-555-3301',email:'ops@prairiepeak.example',contact_type:'operations',status:'active',updated_at:at(-14)},
  ]

  return {generic,invoices,maintenance,clientRequests,portalContacts}
}
