import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, BarChart3, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardCheck, Database, Factory, FileSpreadsheet, Gauge, LayoutDashboard,
  ListFilter, LogOut, MapPinned, Menu, RefreshCw, Search, ShieldCheck, Users, Wrench, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, setToken } from './api'
import type { CorrectiveAction, Dashboard, Equipment, ModelName, Station, User } from './types'

const MODELS: ModelName[] = ['CITY 4D', 'CITY 5D', 'HR-V', 'WR-V']
type Page = 'dashboard' | 'factory' | 'equipment' | 'actions' | 'reports' | 'users'
type DimensionType = 'process' | 'transformer' | 'po_gun'

function fmt(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('en-MY', { maximumFractionDigits: digits })
}
function pct(value: number | null | undefined) { return value == null ? '—' : `${fmt(value, 1)}%` }
function niceDate(value?: string | null) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString() }
function clsStatus(status?: string | null) { return (status || 'UNVERIFIED').toLowerCase().replaceAll(' ', '-') }

function StatusPill({ status }: {status?: string | null}) {
  return <span className={`status-pill status-${clsStatus(status)}`}><span className="status-dot" />{status || 'UNVERIFIED'}</span>
}
function KpiCard({ label, value, hint, icon, tone = 'blue' }: {label:string;value:string|number;hint?:string;icon:ReactNode;tone?:string}) {
  return <section className={`kpi-card tone-${tone}`}><div className="kpi-head"><span>{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value">{value}</div>{hint && <div className="kpi-hint">{hint}</div>}</section>
}
function SectionTitle({ title, subtitle, action }: {title:string;subtitle?:string;action?:ReactNode}) {
  return <div className="section-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}
function EmptyState({ title, detail, icon = <CircleHelp size={22}/> }: {title:string;detail:string;icon?:ReactNode}) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{detail}</p></div>
}
function LoadingInline() { return <div className="loading-inline"><RefreshCw size={15} className="spin"/> Loading data…</div> }

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('po-gun-token'))
  const [user, setUser] = useState<User | null>(null)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('ChangeMeNow!')
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedModel, setSelectedModel] = useState('ALL')
  const [selectedZone, setSelectedZone] = useState('ALL')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [models, setModels] = useState<{id:number;name:string;equipment_count:number}[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [equipmentTotal, setEquipmentTotal] = useState(0)
  const [equipmentOffset, setEquipmentOffset] = useState(0)
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [equipmentStatus, setEquipmentStatus] = useState('ALL')
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStation, setSelectedStation] = useState<any>(null)
  const [activeMapZone, setActiveMapZone] = useState('ZONE A')
  const [actions, setActions] = useState<CorrectiveAction[]>([])
  const [actionsTotal, setActionsTotal] = useState(0)
  const [actionSearch, setActionSearch] = useState('')
  const [actionStatusFilter, setActionStatusFilter] = useState('ALL')
  const [actionCreateOpen, setActionCreateOpen] = useState(false)
  const [actionEquipmentChoices, setActionEquipmentChoices] = useState<Equipment[]>([])
  const [actionEquipmentId, setActionEquipmentId] = useState('')
  const [actionParameter, setActionParameter] = useState<'Welding Current'|'Pressure'>('Welding Current')
  const [actionProblem, setActionProblem] = useState('')
  const [actionPlan, setActionPlan] = useState('')
  const [actionPic, setActionPic] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionRemarks, setActionRemarks] = useState('')
  const [createSaving, setCreateSaving] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [equipmentDetail, setEquipmentDetail] = useState<Equipment | null>(null)
  const [dimensionDetails, setDimensionDetails] = useState<{type:DimensionType;data:any}|null>(null)
  const [dimensionLoading, setDimensionLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [recordReadingOpen, setRecordReadingOpen] = useState(false)
  const [readingParameter, setReadingParameter] = useState<'Welding Current'|'Pressure'>('Welding Current')
  const [readingValue, setReadingValue] = useState('')
  const [readingUnit, setReadingUnit] = useState('')
  const [readingObservedAt, setReadingObservedAt] = useState(() => localDateTimeValue())
  const [readingNote, setReadingNote] = useState('')
  const [readingSaving, setReadingSaving] = useState(false)
  const [verifyAction, setVerifyAction] = useState<CorrectiveAction | null>(null)
  const [verifierName, setVerifierName] = useState('')
  const [verificationDate, setVerificationDate] = useState(new Date().toISOString().slice(0,10))
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState('technician')
  const [globalError, setGlobalError] = useState('')
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { setToken(token); }, [token])
  useEffect(() => {
    if (!token) { setUser(null); return }
    setToken(token)
    api.me().then(setUser).catch(() => { localStorage.removeItem('po-gun-token'); setTokenState(null); setToken(null); setUser(null) })
  }, [token])

  const logout = useCallback(() => {
    localStorage.removeItem('po-gun-token'); setToken(null); setTokenState(null); setUser(null); setDashboard(null); setSelectedEquipment(null)
  }, [])

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setLoginError(''); setLoginLoading(true)
    try {
      const response = await api.login(username, password)
      localStorage.setItem('po-gun-token', response.access_token); setToken(response.access_token); setTokenState(response.access_token); setUser(response.user)
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'Login failed') }
    finally { setLoginLoading(false) }
  }

  const loadDashboard = useCallback(async () => {
    if (!user) return
    try { const data = await api.dashboard(selectedModel, selectedZone); setDashboard(data); setGlobalError('') }
    catch (error) { setGlobalError(error instanceof Error ? error.message : 'Dashboard data could not be loaded') }
  }, [user, selectedModel, selectedZone])
  const loadEquipment = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.equipment({ model: selectedModel, zone: selectedZone, status: equipmentStatus, q: equipmentSearch, offset: equipmentOffset, limit: 25 })
      setEquipment(data.items); setEquipmentTotal(data.total)
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Equipment data could not be loaded') }
  }, [user, selectedModel, selectedZone, equipmentStatus, equipmentSearch, equipmentOffset])
  const loadActions = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.actions({ model: selectedModel, zone: selectedZone, status: actionStatusFilter, q: actionSearch, offset: 0, limit: 100 })
      setActions(data.items); setActionsTotal(data.total)
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Corrective actions could not be loaded') }
  }, [user, selectedModel, selectedZone, actionStatusFilter, actionSearch])
  const loadStations = useCallback(async () => {
    if (!user) return
    try { setStations(await api.stations(selectedModel, selectedZone === 'ALL' ? undefined : selectedZone)) }
    catch (error) { setGlobalError(error instanceof Error ? error.message : 'Station data could not be loaded') }
  }, [user, selectedModel, selectedZone])

  useEffect(() => { if (!user) return; api.models().then(setModels).catch(() => undefined); }, [user])
  useEffect(() => { void loadDashboard() }, [loadDashboard])
  useEffect(() => { void loadEquipment() }, [loadEquipment])
  useEffect(() => { void loadActions() }, [loadActions])
  useEffect(() => { void loadStations() }, [loadStations])
  useEffect(() => { if (user && page === 'actions') api.equipment({ model: selectedModel, limit: 500 }).then(d => setActionEquipmentChoices(d.items)).catch(() => undefined) }, [user, page, selectedModel])
  useEffect(() => { if (user && page === 'users' && user.role === 'admin') fetchUsers() }, [user, page])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 4500); return () => window.clearTimeout(id) }, [toast])

  async function openEquipment(item: Equipment) {
    setSelectedEquipment(item); setEquipmentDetail(null); setDetailError(''); setDimensionDetails(null); setRecordReadingOpen(false)
    try { setEquipmentDetail(await api.equipmentDetail(item.id)) }
    catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to load equipment details') }
  }
  async function openDimension(type: DimensionType, id: number | undefined) {
    if (!id) return
    setDimensionLoading(true); setDetailError(''); setDimensionDetails(null)
    try {
      const data = type === 'process' ? await api.stationDetail(id, selectedModel) : type === 'transformer' ? await api.transformerDetail(id, selectedModel) : await api.poGunDetail(id, selectedModel)
      setDimensionDetails({ type, data })
    } catch (error) { setDetailError(error instanceof Error ? error.message : 'Unable to load selected details') }
    finally { setDimensionLoading(false) }
  }
  async function openStation(station: Station | any) {
    if (!station) { setSelectedStation(null); return }
    setSelectedStation(station)
    try { setSelectedStation(await api.stationDetail(station.id, selectedModel)) }
    catch (error) { setGlobalError(error instanceof Error ? error.message : 'Unable to load process details') }
  }
  async function hardRefresh() {
    setRefreshing(true)
    await Promise.all([loadDashboard(), loadEquipment(), loadActions(), loadStations()])
    setRefreshing(false); setToast('Data refreshed from the database.')
  }
  async function saveReading(event: FormEvent) {
    event.preventDefault(); if (!equipmentDetail) return
    setReadingSaving(true); setDetailError('')
    try {
      await api.addReading(equipmentDetail.id, { parameter_name: readingParameter, value: Number(readingValue), unit: readingUnit, observed_at: new Date(readingObservedAt).toISOString(), note: readingNote || undefined })
      const detail = await api.equipmentDetail(equipmentDetail.id); setEquipmentDetail(detail); setSelectedEquipment(detail)
      await Promise.all([loadDashboard(), loadEquipment(), loadStations()]); setRecordReadingOpen(false); setToast(`${readingParameter} reading saved and equipment status recalculated.`)
    } catch (error) { setDetailError(error instanceof Error ? error.message : 'Could not save reading') }
    finally { setReadingSaving(false) }
  }
  async function createAction(event: FormEvent) {
    event.preventDefault(); setCreateSaving(true); setGlobalError('')
    const selected = actionEquipmentChoices.find(x => x.id === Number(actionEquipmentId))
    try {
      const result = await api.createAction({
        assignment_id: actionEquipmentId ? Number(actionEquipmentId) : undefined,
        abnormal_parameter: actionParameter,
        actual_reading: selected ? (actionParameter === 'Welding Current' ? selected.current_actual : selected.pressure_actual) : undefined,
        target_or_limit: selected ? (actionParameter === 'Welding Current' ? selected.current_target : selected.pressure_target) : undefined,
        problem_description: actionProblem,
        corrective_action: actionPlan || undefined,
        pic: actionPic || undefined,
        due_date: actionDueDate || undefined,
        remarks: actionRemarks || undefined,
        action_status: 'Open',
      })
      setActionCreateOpen(false); resetActionForm(); await loadActions(); setToast(`Corrective action ${result.display_id} created.`)
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Could not create corrective action') }
    finally { setCreateSaving(false) }
  }
  function resetActionForm() { setActionEquipmentId(''); setActionParameter('Welding Current'); setActionProblem(''); setActionPlan(''); setActionPic(''); setActionDueDate(''); setActionRemarks('') }
  async function updateActionStatus(action: CorrectiveAction, newStatus: string) {
    try {
      if (newStatus === 'Closed - Verified') { setVerifyAction(action); setVerifierName(user?.username || ''); setVerificationDate(new Date().toISOString().slice(0,10)); return }
      await api.updateAction(action.id, { action_status: newStatus }); await loadActions(); setToast(`${action.display_id} updated.`)
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Could not update action') }
  }
  async function saveVerification(event: FormEvent) {
    event.preventDefault(); if (!verifyAction) return
    try {
      await api.updateAction(verifyAction.id, { action_status: 'Closed - Verified', verified_by: verifierName, verification_date: verificationDate })
      setVerifyAction(null); await loadActions(); setToast(`${verifyAction.display_id} verified and closed.`)
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Verification failed') }
  }
  async function previewImport() {
    if (!uploadFile) return
    setImportBusy(true); setImportPreview(null)
    try { setImportPreview(await api.importEquipment(uploadFile, false)) }
    catch (error) { setGlobalError(error instanceof Error ? error.message : 'Workbook validation failed') }
    finally { setImportBusy(false) }
  }
  async function confirmImport() {
    if (!uploadFile) return
    setImportBusy(true)
    try {
      const res = await api.importEquipment(uploadFile, true); setImportPreview(res); setToast(`Import complete: ${res.created} created, ${res.updated} updated.`)
      await Promise.all([loadDashboard(), loadEquipment(), loadStations()])
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Workbook import failed') }
    finally { setImportBusy(false) }
  }
  async function fetchUsers() {
    try { const response = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Could not load users'); setUsers(await response.json()) }
    catch (error) { setGlobalError(error instanceof Error ? error.message : 'Could not load users') }
  }
  async function createUser(event: FormEvent) {
    event.preventDefault()
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: {'Content-Type':'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({username:newUserName,password:newUserPassword,role:newUserRole}) })
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Could not create user')
      setNewUserName(''); setNewUserPassword(''); setNewUserRole('technician'); await fetchUsers(); setToast(`User ${body.username} created.`)
    } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Could not create user') }
  }
  async function exportCsv() { try { await api.exportEquipment(selectedModel); setToast('Equipment CSV export started.') } catch (error) { setGlobalError(error instanceof Error ? error.message : 'Export failed') } }

  const titleByPage: Record<Page,string> = { dashboard: 'Master Summary Dashboard', factory: 'Interactive Factory Map', equipment: 'Equipment Register', actions: 'Corrective Action Log', reports: 'Reports & Historical Analysis', users: 'User Access Management' }
  const filteredStations = useMemo(() => stations.filter(s => activeMapZone === 'ALL' || s.zone === activeMapZone), [stations, activeMapZone])
  const selectedActionEquipment = actionEquipmentChoices.find(x => x.id === Number(actionEquipmentId))

  if (!token || !user) {
    return <div className="login-shell"><div className="login-art"><div className="login-brand"><div className="brand-mark"><Gauge size={24}/></div><div><b>PO GUN</b><span>INTERACTIVE MONITORING</span></div></div><div className="login-headline"><span className="eyebrow">AUTOMOTIVE MANUFACTURING</span><h1>Welding parameter control, connected to the factory floor.</h1><p>A traceable digital workspace for equipment health, process drill-down, and corrective actions.</p></div><div className="login-plant"><Factory size={18}/><span>206 source register equipment records</span><span className="plant-line"/><span>4 car models</span></div></div><div className="login-panel"><form className="login-card" onSubmit={signIn}><div className="login-card-title"><div className="brand-mark small"><ShieldCheck size={19}/></div><div><h2>Sign in to the monitoring system</h2><p>Use an authorized factory account.</p></div></div>{loginError && <div className="alert alert-error">{loginError}</div>}<label>Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>Password<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="btn btn-primary wide" disabled={loginLoading}>{loginLoading ? 'Signing in…' : 'Sign in'}<ArrowRight size={17}/></button><div className="login-note"><ShieldCheck size={14}/> Local development account is documented in README. Change the password before deployment.</div></form><div className="login-foot">PO Gun Monitoring System · MVP 0.1.0</div></div></div>
  }

  return <div className="app-frame">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Gauge size={23}/></div><div><b>PO GUN</b><span>MONITORING SYSTEM</span></div><button className="icon-btn mobile-close" aria-label="Close menu" onClick={()=>setSidebarOpen(false)}><X size={19}/></button></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="side-nav">
        <NavItem active={page==='dashboard'} icon={<LayoutDashboard size={18}/>} label="Overview" onClick={()=>{setPage('dashboard');setSidebarOpen(false)}}/>
        <NavItem active={page==='factory'} icon={<MapPinned size={18}/>} label="Factory Map" onClick={()=>{setPage('factory');setSidebarOpen(false)}}/>
        <NavItem active={page==='equipment'} icon={<Database size={18}/>} label="Equipment Register" onClick={()=>{setPage('equipment');setSidebarOpen(false)}}/>
        <NavItem active={page==='actions'} icon={<ClipboardCheck size={18}/>} label="Corrective Actions" onClick={()=>{setPage('actions');setSidebarOpen(false)}}/>
        <NavItem active={page==='reports'} icon={<BarChart3 size={18}/>} label="Reports & Trends" onClick={()=>{setPage('reports');setSidebarOpen(false)}}/>
        {user.role==='admin' && <NavItem active={page==='users'} icon={<Users size={18}/>} label="User Access" onClick={()=>{setPage('users');setSidebarOpen(false)}}/>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-connection"><span className="connection-dot"/><div><b>Database connected</b><span>Source register · 206 records</span></div></div><div className="sidebar-user"><div className="avatar">{user.username.slice(0,1).toUpperCase()}</div><div className="user-meta"><b>{user.username}</b><span>{user.role.replaceAll('_',' ')}</span></div><button className="icon-btn logout-btn" title="Sign out" onClick={logout}><LogOut size={16}/></button></div></div>
    </aside>
    {sidebarOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={()=>setSidebarOpen(false)}/>}
    <main className="main-content">
      <header className="topbar"><button className="icon-btn menu-btn" aria-label="Open navigation" onClick={()=>setSidebarOpen(true)}><Menu size={20}/></button><div className="breadcrumb"><span>PO GUN MONITORING</span><ChevronDown size={14}/><b>{titleByPage[page]}</b></div><div className="topbar-right"><label className="top-filter"><span>MODEL</span><select value={selectedModel} onChange={e=>{setSelectedModel(e.target.value);setEquipmentOffset(0)}}><option value="ALL">All models</option>{MODELS.map(m=><option key={m} value={m}>{m}</option>)}</select></label><label className="top-filter zone-filter"><span>ZONE</span><select value={selectedZone} onChange={e=>setSelectedZone(e.target.value)}><option value="ALL">All zones</option><option>ZONE A</option><option>ZONE B</option></select></label><button className="icon-btn refresh-btn" title="Refresh data" onClick={hardRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing?'spin':''}/></button></div></header>
      <div className="page-container">
        <div className="page-heading"><div><div className="eyebrow">LIVE SOURCE REGISTER</div><h1>{titleByPage[page]}</h1><p>{pageSubtitle(page, selectedModel, selectedZone)}</p></div><div className="heading-actions">{page==='equipment' && <button className="btn btn-outline" onClick={exportCsv}><ArrowDownToLine size={16}/> Export CSV</button>}{page==='actions' && <button className="btn btn-primary" onClick={()=>setActionCreateOpen(true)}><ClipboardCheck size={16}/> New corrective action</button>}</div></div>
        <div className="data-notice"><div className="notice-icon"><AlertTriangle size={17}/></div><div><b>Source-data validation required before production use</b><span>Units are not labelled in the register, and exact factory-map pin coordinates are not verified. Values are preserved as supplied; no automatic unit conversion or setpoint changes are performed.</span></div><span className="notice-count">2 checks pending</span></div>
        {globalError && <div className="alert alert-error global-alert"><AlertTriangle size={17}/><span>{globalError}</span><button className="icon-btn" onClick={()=>setGlobalError('')}><X size={16}/></button></div>}
        {page==='dashboard' && <DashboardPage dashboard={dashboard} loading={!dashboard} onOpenEquipment={openEquipment} onNavigate={setPage} onOpenAction={a=>{setPage('actions');setActionSearch(a.display_id)}}/>}
        {page==='factory' && <FactoryPage stations={filteredStations} activeZone={activeMapZone} setActiveZone={setActiveMapZone} selectedModel={selectedModel} selectedStation={selectedStation} onSelectStation={openStation} onOpenEquipment={openEquipment} loading={stations.length===0} selectedZoneFilter={selectedZone}/>}
        {page==='equipment' && <EquipmentPage rows={equipment} total={equipmentTotal} offset={equipmentOffset} search={equipmentSearch} setSearch={v=>{setEquipmentSearch(v);setEquipmentOffset(0)}} status={equipmentStatus} setStatus={v=>{setEquipmentStatus(v);setEquipmentOffset(0)}} onOpen={openEquipment} onPrev={()=>setEquipmentOffset(Math.max(0,equipmentOffset-25))} onNext={()=>setEquipmentOffset(equipmentOffset+25)} onPreviewImport={previewImport} onConfirmImport={confirmImport} uploadFile={uploadFile} setUploadFile={f=>{setUploadFile(f);setImportPreview(null)}} importPreview={importPreview} importBusy={importBusy} userRole={user.role} />}
        {page==='actions' && <ActionsPage actions={actions} total={actionsTotal} search={actionSearch} setSearch={setActionSearch} status={actionStatusFilter} setStatus={setActionStatusFilter} onStatus={updateActionStatus} onCreate={()=>setActionCreateOpen(true)}/>}
        {page==='reports' && <ReportsPage dashboard={dashboard} onExport={exportCsv} selectedModel={selectedModel} selectedZone={selectedZone}/>}
        {page==='users' && user.role==='admin' && <UsersPage users={users} username={newUserName} setUsername={setNewUserName} password={newUserPassword} setPassword={setNewUserPassword} role={newUserRole} setRole={setNewUserRole} onSubmit={createUser}/>}
        <footer className="page-footer"><span>PO Gun Interactive Monitoring System · MVP 0.1.0</span><span>Current snapshot: September (year not specified) · <button onClick={hardRefresh}>Refresh data</button></span></footer>
      </div>
    </main>

    {selectedEquipment && <EquipmentDrawer item={equipmentDetail || selectedEquipment} loading={!equipmentDetail} error={detailError} onClose={()=>{setSelectedEquipment(null);setEquipmentDetail(null);setDetailError('')}} onOpenDimension={openDimension} onCreateAction={()=>{setActionEquipmentId(String((equipmentDetail||selectedEquipment).id));setActionParameter('Welding Current');setActionCreateOpen(true);setSelectedEquipment(null)}} onRecordReading={()=>{const x=equipmentDetail||selectedEquipment;setReadingParameter('Welding Current');setReadingValue('');setReadingUnit(x.current_unit);setReadingObservedAt(localDateTimeValue());setReadingNote('');setRecordReadingOpen(true)}} recordReadingOpen={recordReadingOpen} setRecordReadingOpen={setRecordReadingOpen} readingParameter={readingParameter} setReadingParameter={setReadingParameter} readingValue={readingValue} setReadingValue={setReadingValue} readingUnit={readingUnit} setReadingUnit={setReadingUnit} readingObservedAt={readingObservedAt} setReadingObservedAt={setReadingObservedAt} readingNote={readingNote} setReadingNote={setReadingNote} onSaveReading={saveReading} readingSaving={readingSaving} onOpenAction={a=>{setSelectedEquipment(null);setPage('actions');setActionSearch(a.display_id)}}/>}
    {dimensionDetails && <DimensionDrawer value={dimensionDetails} loading={dimensionLoading} onClose={()=>setDimensionDetails(null)} onOpenEquipment={openEquipment} onOpenDimension={openDimension}/>}
    {actionCreateOpen && <Modal title="Create corrective action" subtitle="Record an inspection issue and assign follow-up. The system will check for duplicate open actions." onClose={()=>setActionCreateOpen(false)}><form className="modal-form" onSubmit={createAction}><label>Equipment record<select required value={actionEquipmentId} onChange={e=>setActionEquipmentId(e.target.value)}><option value="">Select equipment…</option>{actionEquipmentChoices.map(x=><option key={x.id} value={x.id}>{x.car_model} · {x.zone} · {x.process} · {x.po_gun_id}</option>)}</select></label>{selectedActionEquipment && <div className="selected-equipment-mini"><div><span>Current status</span><StatusPill status={selectedActionEquipment.overall_status}/></div><div><span>Selected parameter reading</span><b>{fmt(actionParameter==='Welding Current'?selectedActionEquipment.current_actual:selectedActionEquipment.pressure_actual)} <small>{actionParameter==='Welding Current'?selectedActionEquipment.current_unit:selectedActionEquipment.pressure_unit}</small></b></div></div>}<div className="form-grid"><label>Abnormal parameter<select value={actionParameter} onChange={e=>setActionParameter(e.target.value as 'Welding Current'|'Pressure')}><option>Welding Current</option><option>Pressure</option></select></label><label>Person in charge (PIC)<input value={actionPic} onChange={e=>setActionPic(e.target.value)} placeholder="Enter PIC"/></label><label className="span-2">Problem description<textarea required minLength={3} rows={3} value={actionProblem} onChange={e=>setActionProblem(e.target.value)} placeholder="Describe the observed issue or inspection finding"/></label><label className="span-2">Planned corrective action<textarea rows={2} value={actionPlan} onChange={e=>setActionPlan(e.target.value)} placeholder="Enter approved follow-up action (do not guess a machine setpoint)"/></label><label>Due date<input type="date" value={actionDueDate} onChange={e=>setActionDueDate(e.target.value)}/></label><label>Remarks<input value={actionRemarks} onChange={e=>setActionRemarks(e.target.value)} placeholder="Optional traceability note"/></label></div><div className="modal-foot"><button type="button" className="btn btn-outline" onClick={()=>setActionCreateOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={createSaving}>{createSaving?'Saving…':'Create action'}<ArrowRight size={16}/></button></div></form></Modal>}
    {verifyAction && <Modal title={`Verify ${verifyAction.display_id}`} subtitle="Only an administrator or quality inspector can close an action." onClose={()=>setVerifyAction(null)}><form className="modal-form" onSubmit={saveVerification}><label>Verified by<input required value={verifierName} onChange={e=>setVerifierName(e.target.value)} placeholder="Inspector name"/></label><label>Verification date<input required type="date" value={verificationDate} onChange={e=>setVerificationDate(e.target.value)}/></label><div className="modal-foot"><button className="btn btn-outline" type="button" onClick={()=>setVerifyAction(null)}>Cancel</button><button className="btn btn-primary" type="submit">Confirm verification<CheckCircle2 size={16}/></button></div></form></Modal>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button className="icon-btn" onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>
}

function localDateTimeValue() { const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16) }
function pageSubtitle(page: Page, model: string, zone: string) {
  const filterText = `${model==='ALL'?'all car models':model} · ${zone==='ALL'?'both factory zones':zone}`
  const map: Record<Page,string> = {
    dashboard: `Equipment health and parameter compliance across ${filterText}.`,
    factory: `Select a real process or station from the supplied layout and drill into its equipment for ${filterText}.`,
    equipment: `Search and inspect source register entries for ${filterText}.`,
    actions: `Track corrective action ownership, deadlines, and verification for ${filterText}.`,
    reports: `Compare equipment health and export source-backed monitoring data for ${filterText}.`,
    users: 'Create and manage authorized roles for this monitoring application.',
  }
  return map[page]
}
function NavItem({ active, icon, label, onClick }: {active:boolean;icon:ReactNode;label:string;onClick:()=>void}) {
  return <button className={`nav-item ${active?'nav-active':''}`} onClick={onClick}>{icon}<span>{label}</span>{active && <span className="nav-active-line"/>}</button>
}

function DashboardPage({ dashboard, loading, onOpenEquipment, onNavigate, onOpenAction }: {dashboard:Dashboard|null;loading:boolean;onOpenEquipment:(x:Equipment)=>void;onNavigate:(p:Page)=>void;onOpenAction:(a:CorrectiveAction)=>void}) {
  if (loading || !dashboard) return <div className="panel"><LoadingInline/></div>
  const { summary } = dashboard
  return <div className="dashboard-stack">
    <div className="kpi-grid">
      <KpiCard label="Total equipment" value={summary.total} hint="Equipment register records" icon={<Gauge size={20}/>} tone="blue"/>
      <KpiCard label="Equipment OK" value={summary.ok} hint="Within configured parameter limits" icon={<CheckCircle2 size={20}/>} tone="green"/>
      <KpiCard label="Equipment NG" value={summary.ng} hint={`${dashboard.current_ng} current · ${dashboard.pressure_ng} pressure`} icon={<AlertTriangle size={20}/>} tone="red"/>
      <KpiCard label="Unverified" value={summary.unverified} hint="Missing or invalid actuals / limits" icon={<CircleHelp size={20}/>} tone="amber"/>
      <KpiCard label="Overall OK rate" value={pct(summary.ok_rate)} hint="OK records divided by total records" icon={<Activity size={20}/>} tone="navy"/>
    </div>
    <div className="dashboard-grid dashboard-grid-main">
      <section className="panel chart-panel"><SectionTitle title="Model comparison" subtitle="Live status from the 206 equipment register rows" action={<button className="text-btn" onClick={()=>onNavigate('reports')}>Open reports <ArrowRight size={14}/></button>}/><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.model_comparison} margin={{top:8,right:8,left:-18,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4ebf2"/><XAxis dataKey="model" tick={{fontSize:11,fill:'#64758b'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#64758b'}} allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip contentStyle={{border:'1px solid #d9e2ec',borderRadius:8,fontSize:12}}/><Legend wrapperStyle={{fontSize:12}}/><Bar dataKey="ok" name="OK" stackId="health" fill="#168567" radius={[3,3,0,0]}/><Bar dataKey="ng" name="NG" stackId="health" fill="#d94848"/><Bar dataKey="unverified" name="Unverified" stackId="health" fill="#d7a33c"/></BarChart></ResponsiveContainer></div><div className="chart-footnote">Every source model count matches the register. Historical trend lines remain empty until dated readings are collected.</div></section>
      <section className="panel"><SectionTitle title="Zone health" subtitle="Selected model / zone filter"/><div className="zone-health-list">{dashboard.zone_comparison.map(z=><div className="zone-health-item" key={z.zone}><div className="zone-icon"><Factory size={18}/></div><div className="zone-health-main"><div className="zone-name-row"><b>{z.zone}</b><span>{z.total} equipment</span></div><div className="progress-track"><div className="progress-fill" style={{width:`${z.total?100*z.ok/z.total:0}%`}}/></div><div className="zone-breakdown"><span><i className="dot-green"/>{z.ok} OK</span><span><i className="dot-red"/>{z.ng} NG</span><span><i className="dot-amber"/>{z.unverified} Unverified</span></div></div></div>)}</div><div className="zone-summary-total"><span>Combined equipment</span><b>{dashboard.zone_comparison.reduce((n,z)=>n+z.total,0)}</b></div></section>
    </div>
    <div className="dashboard-grid dashboard-grid-secondary">
      <section className="panel table-panel"><SectionTitle title="Abnormal equipment" subtitle="NG and Unverified records requiring review" action={<button className="text-btn" onClick={()=>onNavigate('equipment')}>Equipment register <ArrowRight size={14}/></button>}/>{dashboard.abnormal_equipment.length ? <EquipmentTable rows={dashboard.abnormal_equipment} onOpen={onOpenEquipment} compact/> : <EmptyState title="No current NG or Unverified records" detail="All 206 register entries currently evaluate within their configured limits. Imported units and source dates still require engineering confirmation." icon={<CheckCircle2 size={24} />}/>}</section>
      <section className="panel table-panel"><SectionTitle title="Recent corrective actions" subtitle="Legacy rows are preserved from the source workbook" action={<button className="text-btn" onClick={()=>onNavigate('actions')}>View all <ArrowRight size={14}/></button>}/>{dashboard.recent_actions.length ? <div className="mini-action-list">{dashboard.recent_actions.slice(0,5).map(a=><button className="mini-action-row" key={a.id} onClick={()=>onOpenAction(a)}><div className="mini-action-icon"><ClipboardCheck size={17}/></div><div className="mini-action-copy"><b>{a.display_id}</b><span>{a.car_model || 'Model not specified'} · {a.abnormal_parameter}</span><small>{a.process || 'Process not specified'}</small></div><div className="mini-action-status"><span className={`action-status status-${clsStatus(a.action_status)}`}>{a.action_status}</span><ArrowRight size={14}/></div></button>)}</div> : <EmptyState title="No corrective actions" detail="New actions will appear here when an issue is recorded."/>}</section>
    </div>
    <DataNotes notes={dashboard.data_quality.notes}/>
  </div>
}

function EquipmentTable({ rows, onOpen, compact=false }: {rows:Equipment[];onOpen:(x:Equipment)=>void;compact?:boolean}) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Car model</th><th>Zone</th><th>Process</th><th>Transformer</th><th>PO Gun</th><th>Current</th><th>Pressure</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(x=><tr key={x.id} className="clickable-row" onClick={()=>onOpen(x)}><td><b>{x.car_model}</b></td><td><span className="zone-tag">{x.zone}</span></td><td className="process-cell">{x.process}</td><td>{x.transformer_id}</td><td><b className="gun-code">{x.po_gun_id}</b></td><td><div className="value-cell"><b>{fmt(x.current_actual)}</b><small>Target {fmt(x.current_target)}</small><StatusPill status={x.current_status}/></div></td><td><div className="value-cell"><b>{fmt(x.pressure_actual)}</b><small>Target {fmt(x.pressure_target)}</small><StatusPill status={x.pressure_status}/></div></td><td><StatusPill status={x.overall_status}/></td><td><ArrowRight size={15} className="row-arrow"/></td></tr>)}</tbody></table>{rows.length===0 && <EmptyState title="No matching equipment" detail="Adjust the model, zone, status, or search terms."/>}</div>
}

function DataNotes({ notes }: {notes:string[]}) {
  return <section className="data-notes"><div className="data-notes-heading"><AlertTriangle size={17}/><b>Data quality / migration notes</b></div><div className="data-notes-grid">{notes.map((n,i)=><div key={i}><span>{String(i+1).padStart(2,'0')}</span><p>{n}</p></div>)}</div></section>
}

function FactoryPage({stations,activeZone,setActiveZone,selectedModel,selectedStation,onSelectStation,onOpenEquipment,loading,selectedZoneFilter}:{stations:Station[];activeZone:string;setActiveZone:(x:string)=>void;selectedModel:string;selectedStation:any;onSelectStation:(s:Station|any)=>void;onOpenEquipment:(x:Equipment)=>void;loading:boolean;selectedZoneFilter:string}) {
  const allCount = stations.reduce((n,s)=>n+s.total,0)
  const zoneACount = stations.filter(s=>s.zone==='ZONE A').reduce((n,s)=>n+s.total,0)
  const zoneBCount = stations.filter(s=>s.zone==='ZONE B').reduce((n,s)=>n+s.total,0)
  return <div className="factory-page-stack">
    <div className="factory-summary-strip"><div><span>Selected model</span><b>{selectedModel==='ALL'?'All models':selectedModel}</b></div><div><span>Factory equipment</span><b>{allCount}</b></div><div><span>Zone A</span><b>{zoneACount}</b></div><div><span>Zone B</span><b>{zoneBCount}</b></div><div className="factory-summary-warning"><AlertTriangle size={15}/><span>Map pin coordinates require verification</span></div></div>
    <section className="panel map-panel"><SectionTitle title="Factory layout reference" subtitle="Source image from the workbook’s FACTORY MAP sheet. Use the station directory to open process details; exact pin coordinates are not yet verified."/><div className="map-layout"><div className="factory-image-wrap"><img src="/factory-map-source.png" alt="Source factory layout map from the PO Gun monitoring workbook"/><div className="map-image-caption"><MapPinned size={14}/> Original layout reference · source workbook image</div></div><div className="map-legend-panel"><div className="map-legend-title"><span className="connection-dot"/> DATA STATUS</div><div className="legend-row"><StatusPill status="OK"/><span>Within stored limits</span></div><div className="legend-row"><StatusPill status="NG"/><span>Outside stored limits</span></div><div className="legend-row"><StatusPill status="UNVERIFIED"/><span>Missing / invalid data</span></div><div className="map-legend-divider"/><b>How to navigate</b><p>Click a station in the process directory to show its model-specific equipment, transformer IDs, PO Gun IDs, and current status.</p><div className="map-unverified-note"><CircleHelp size={16}/><span>The workbook contains process position labels but not validated X/Y coordinates. The app does not place invented pins on the layout.</span></div></div></div></section>
    <section className="panel station-directory-panel"><SectionTitle title="Selectable station directory" subtitle="Click a process name to drill down into its current equipment and parameter status." action={<div className="zone-segment"><button className={activeZone==='ALL'?'active':''} onClick={()=>setActiveZone('ALL')}>All zones</button><button className={activeZone==='ZONE A'?'active':''} onClick={()=>setActiveZone('ZONE A')}>Zone A</button><button className={activeZone==='ZONE B'?'active':''} onClick={()=>setActiveZone('ZONE B')}>Zone B</button></div>}/>
      {loading ? <LoadingInline/> : <div className="station-directory-grid">{['ZONE A','ZONE B'].filter(z=>activeZone==='ALL'||activeZone===z).filter(z=>selectedZoneFilter==='ALL'||selectedZoneFilter===z).map(zone=><div className="station-zone-column" key={zone}><div className="station-zone-heading"><div><span className="zone-tag">{zone}</span><b>{zone==='ZONE A'?'Front / floor processes':'Side panel / rear processes'}</b></div><span>{stations.filter(s=>s.zone===zone).length} stations</span></div><div className="station-list">{stations.filter(s=>s.zone===zone).map(s=><button key={s.id} className={`station-row ${selectedStation?.id===s.id?'station-row-active':''}`} onClick={()=>onSelectStation(s)}><div className={`station-status-mark ${s.ng?'ng':''} ${s.unverified?'unverified':''}`}>{s.overall_status==='OK'?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}</div><div className="station-row-copy"><b>{s.process}</b><span>{s.total} equipment · {s.ok} OK · {s.ng} NG · {s.unverified} unverified</span></div><ArrowRight size={15}/></button>)}{stations.filter(s=>s.zone===zone).length===0 && <p className="no-stations">No stations for this filter.</p>}</div></div>)}</div>}
    </section>
    {selectedStation && <section className="panel process-detail-panel"><div className="process-detail-heading"><div><div className="eyebrow">PROCESS DETAILS</div><h2>{selectedStation.process}</h2><p>{selectedStation.zone} · {selectedModel==='ALL'?'All models':selectedModel}</p></div><button className="btn btn-outline" onClick={()=>onSelectStation(null as any)}>Close details</button></div><div className="process-kpis"><MiniStat label="Total equipment" value={selectedStation.total||0}/><MiniStat label="OK" value={selectedStation.ok||0} tone="green"/><MiniStat label="NG" value={selectedStation.ng||0} tone="red"/><MiniStat label="Unverified" value={selectedStation.unverified||0} tone="amber"/><MiniStat label="Transformers" value={selectedStation.transformers?.length||new Set((selectedStation.equipment||[]).map((x:Equipment)=>x.transformer_id)).size}/></div><div className="process-map-note">Map position: {selectedStation.map_position||'Not supplied'} · {selectedStation.coordinates_verified?'Coordinates verified':'Exact coordinates not verified'}</div><EquipmentTable rows={selectedStation.equipment||[]} onOpen={onOpenEquipment} compact/></section>}
  </div>
}
function MiniStat({label,value,tone='blue'}:{label:string;value:string|number;tone?:string}) { return <div className={`mini-stat mini-${tone}`}><span>{label}</span><b>{value}</b></div> }

function EquipmentPage({rows,total,offset,search,setSearch,status,setStatus,onOpen,onPrev,onNext,onPreviewImport,onConfirmImport,uploadFile,setUploadFile,importPreview,importBusy,userRole}:{rows:Equipment[];total:number;offset:number;search:string;setSearch:(v:string)=>void;status:string;setStatus:(v:string)=>void;onOpen:(x:Equipment)=>void;onPrev:()=>void;onNext:()=>void;onPreviewImport:()=>void;onConfirmImport:()=>void;uploadFile:File|null;setUploadFile:(f:File|null)=>void;importPreview:any;importBusy:boolean;userRole:string}) {
  return <div className="equipment-page-stack"><section className="panel register-panel"><div className="register-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search model, process, transformer, or PO Gun…"/><kbd>SEARCH</kbd></div><label className="filter-control"><ListFilter size={16}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option><option>OK</option><option>NG</option><option>UNVERIFIED</option></select></label></div><div className="register-meta"><span><b>{total}</b> equipment records found</span><span>Rows {total===0?0:offset+1}–{Math.min(offset+rows.length,total)} of {total}</span></div><EquipmentTable rows={rows} onOpen={onOpen}/><div className="pagination"><span>Page {Math.floor(offset/25)+1} of {Math.max(1,Math.ceil(total/25))}</span><div><button className="btn btn-outline" disabled={offset===0} onClick={onPrev}>Previous</button><button className="btn btn-outline" disabled={offset+25>=total} onClick={onNext}>Next <ArrowRight size={14}/></button></div></div></section>
    {userRole==='admin'||userRole==='engineer' ? <section className="panel import-panel"><SectionTitle title="Import workbook" subtitle="Validate the EQUIPMENT REGISTER sheet before applying any changes. Existing records are upserted by model, process, transformer, and PO Gun; records are never deleted."/><div className="import-controls"><label className="file-drop"><FileSpreadsheet size={22}/><span><b>{uploadFile?.name||'Choose .xlsx or .xlsm workbook'}</b><small>Max 25 MB · Original workbook is never modified</small></span><input type="file" accept=".xlsx,.xlsm" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/></label><button className="btn btn-outline" disabled={!uploadFile||importBusy} onClick={onPreviewImport}>{importBusy?'Validating…':'Validate workbook'}</button></div>{importPreview && <div className={`import-result ${importPreview.preview_only?'preview-result':'commit-result'}`}><div className="import-result-heading"><div><b>{importPreview.preview_only?'Import preview':'Import committed'}</b><span>{importPreview.message||'Review the validation result before confirming.'}</span></div><div className="import-counts"><span><b>{importPreview.would_create??importPreview.created??0}</b> create</span><span><b>{importPreview.would_update??importPreview.updated??0}</b> update</span><span><b>{importPreview.rejected_count??0}</b> rejected</span></div></div>{importPreview.errors?.length>0 && <div className="import-errors">{importPreview.errors.slice(0,5).map((e:any,i:number)=><div key={i}><b>Row {e.row||'—'}:</b> {e.error}</div>)}{importPreview.errors.length>5&&<span>… and more in the full validation response.</span>}</div>}{importPreview.preview_only && (importPreview.would_create+importPreview.would_update>0) && <button className="btn btn-primary" disabled={importBusy||importPreview.errors?.some((e:any)=>e.row && e.error?.includes('Duplicate'))} onClick={onConfirmImport}>{importBusy?'Importing…':'Confirm & import'}<ArrowRight size={15}/></button>}</div>}</section> : <div className="permission-note"><ShieldCheck size={16}/> Workbook import is restricted to administrators and engineers.</div>}
  </div>
}

function ActionsPage({actions,total,search,setSearch,status,setStatus,onStatus,onCreate}:{actions:CorrectiveAction[];total:number;search:string;setSearch:(v:string)=>void;status:string;setStatus:(v:string)=>void;onStatus:(a:CorrectiveAction,s:string)=>void;onCreate:()=>void}) {
  return <div className="actions-page-stack"><div className="action-kpi-strip"><MiniStat label="Total records" value={total}/><MiniStat label="Open / pending" value={actions.filter(a=>!['Closed - Verified','Closed','Verified'].includes(a.action_status)).length} tone="amber"/><MiniStat label="Closed & verified" value={actions.filter(a=>a.action_status==='Closed - Verified').length} tone="green"/><div className="action-kpi-note"><ShieldCheck size={17}/><span>Closure requires a verifier identity and verification date.</span></div></div><section className="panel action-table-panel"><div className="register-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search action ID, process, PO Gun, PIC…"/><kbd>SEARCH</kbd></div><label className="filter-control"><ListFilter size={16}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All action statuses</option><option>Open</option><option>In Progress</option><option>Pending Verification</option><option>Pending inspection</option><option>Closed - Verified</option></select></label><button className="btn btn-primary" onClick={onCreate}>New action</button></div><div className="table-scroll"><table className="data-table action-table"><thead><tr><th>Action ID</th><th>Equipment / Process</th><th>Parameter</th><th>Finding</th><th>PIC / Due date</th><th>Action status</th><th>Verification</th></tr></thead><tbody>{actions.map(a=><tr key={a.id}><td><b className="action-id">{a.display_id}</b><small className="subtext">{a.source_label?.startsWith('Excel import')?'Imported legacy row':'Application record'}</small></td><td><b>{a.car_model||'—'} · {a.zone||'—'}</b><small className="subtext">{a.process||'Process not specified'}</small><small className="subtext">{a.transformer_id||'—'} / {a.po_gun_id||'—'}</small></td><td>{a.abnormal_parameter}</td><td><div className="finding-cell">{a.problem_description||'No problem description'}<small>{a.actual_reading==null?'':`Actual ${fmt(a.actual_reading)} · target/limit ${a.target_or_limit_text||fmt(a.target_or_limit)}`}</small></div></td><td>{a.pic||'—'}<small className="subtext">Due {niceDate(a.due_date)}</small></td><td><select className={`inline-status-select status-${clsStatus(a.action_status)}`} value={a.action_status} onChange={e=>onStatus(a,e.target.value)}><option value={a.action_status}>{a.action_status} (current)</option>{['Open','In Progress','Pending Verification','Closed - Verified'].filter(x=>x!==a.action_status).map(x=><option key={x}>{x}</option>)}</select></td><td><span className={`action-status status-${clsStatus(a.verification_status)}`}>{a.verification_status||'Not specified'}</span>{a.verified_by&&<small className="subtext">By {a.verified_by}</small>}</td></tr>)}</tbody></table>{actions.length===0 && <EmptyState title="No corrective actions match these filters" detail="Create a corrective action when an issue is identified. Legacy workbook rows remain visible with their source labels." icon={<ClipboardCheck size={23}/>}/>}</div><div className="table-footnote"><AlertTriangle size={14}/> Imported action rows are preserved from the workbook as found, including legacy records whose Action ID is missing. The source log includes test-looking rows that should be reviewed before deployment.</div></section></div>
}

function ReportsPage({dashboard,onExport,selectedModel,selectedZone}:{dashboard:Dashboard|null;onExport:()=>void;selectedModel:string;selectedZone:string}) {
  const [trends,setTrends] = useState<any>(null); const [trendError,setTrendError] = useState('')
  useEffect(()=>{api.trends(selectedModel).then(setTrends).catch(e=>setTrendError(e instanceof Error?e.message:'Trend request failed'))},[selectedModel])
  return <div className="reports-stack"><div className="reports-toolbar"><div><b>Data scope</b><span>{selectedModel==='ALL'?'All models':selectedModel} · {selectedZone==='ALL'?'All zones':selectedZone}</span></div><button className="btn btn-outline" onClick={onExport}><ArrowDownToLine size={16}/> Export equipment CSV</button></div>{dashboard && <div className="kpi-grid reports-kpis"><KpiCard label="Equipment total" value={dashboard.summary.total} icon={<Database size={19}/>} tone="blue"/><KpiCard label="Current NG" value={dashboard.current_ng} icon={<Activity size={19}/>} tone="red"/><KpiCard label="Pressure NG" value={dashboard.pressure_ng} icon={<Gauge size={19}/>} tone="amber"/><KpiCard label="OK rate" value={pct(dashboard.summary.ok_rate)} icon={<CheckCircle2 size={19}/>} tone="green"/></div>}<div className="dashboard-grid"><section className="panel"><SectionTitle title="Equipment by car model" subtitle="Current register state, based on the selected source dataset"/><div className="chart-area chart-area-medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard?.model_comparison||[]} margin={{top:8,right:8,left:-18,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4ebf2"/><XAxis dataKey="model" tick={{fontSize:11,fill:'#64758b'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#64758b'}} allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip/><Legend/><Bar dataKey="total" name="Total records" fill="#1b5e8f" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></section><section className="panel"><SectionTitle title="Zone distribution" subtitle="Current model / zone selection"/><div className="chart-area chart-area-medium"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboard?.zone_comparison||[]} dataKey="total" nameKey="zone" outerRadius={88} innerRadius={55} paddingAngle={3} label={({name,percent})=>`${name} ${Math.round((percent||0)*100)}%`}>{(dashboard?.zone_comparison||[]).map((z,i)=><Cell key={z.zone} fill={i===0?'#1b5e8f':'#67a1be'}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div><div className="chart-footnote">Zone totals are calculated from equipment assignments, not the map sheet’s default counts.</div></section></div><section className="panel trend-panel"><SectionTitle title="Historical parameter trends" subtitle="Timestamped readings only; imported snapshot data has no confirmed observation date."/><div className="trend-empty-wrap">{trendError?<div className="alert alert-error">{trendError}</div>:trends?.available? <div className="trend-points-table"><div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Parameter</th><th>Average</th><th>Minimum</th><th>Maximum</th><th>Reading count</th></tr></thead><tbody>{trends.items.map((x:any,i:number)=><tr key={`${x.date}-${x.parameter}-${i}`}><td>{x.date}</td><td>{x.parameter}</td><td>{fmt(x.average)}</td><td>{fmt(x.minimum)}</td><td>{fmt(x.maximum)}</td><td>{x.count}</td></tr>)}</tbody></table></div></div>:<EmptyState title="No dated trend records yet" detail={trends?.message||'New parameter readings must include an observation timestamp. Imported values are preserved but are not assigned a made-up date.'} icon={<BarChart3 size={24}/>}/>}</div></section>{dashboard && <DataNotes notes={dashboard.data_quality.notes}/>}</div>
}

function UsersPage({users,username,setUsername,password,setPassword,role,setRole,onSubmit}:{users:any[];username:string;setUsername:(v:string)=>void;password:string;setPassword:(v:string)=>void;role:string;setRole:(v:string)=>void;onSubmit:(e:FormEvent)=>void}) {
  const [busyUser,setBusyUser] = useState<number|null>(null); const [error,setError] = useState('')
  async function toggleActive(id:number,active:boolean) {
    setBusyUser(id);setError('')
    try { const token=localStorage.getItem('po-gun-token'); const res=await fetch(`/api/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({active})}); const body=await res.json(); if(!res.ok)throw new Error(body.detail||'Update failed'); window.location.reload() }
    catch(e){setError(e instanceof Error?e.message:'Update failed')} finally{setBusyUser(null)}
  }
  return <div className="users-stack"><section className="panel"><SectionTitle title="Create authorized user" subtitle="Use named accounts rather than sharing one login. Passwords must contain at least 12 characters."/><form className="create-user-form" onSubmit={onSubmit}><label>Username<input required minLength={3} value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. quality.inspector"/></label><label>Temporary password<input required minLength={12} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters"/></label><label>Role<select value={role} onChange={e=>setRole(e.target.value)}><option value="technician">Technician</option><option value="engineer">Engineer</option><option value="quality_inspector">Quality inspector</option><option value="admin">Administrator</option></select></label><button className="btn btn-primary">Create user<ArrowRight size={15}/></button></form>{error&&<div className="alert alert-error">{error}</div>}</section><section className="panel"><SectionTitle title="User directory" subtitle="Role permissions apply to API writes as well as interface controls."/><div className="table-scroll"><table className="data-table"><thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.username}</b></td><td><span className="zone-tag">{u.role.replaceAll('_',' ')}</span></td><td>{niceDate(u.created_at)}</td><td><StatusPill status={u.active?'OK':'UNVERIFIED'}/></td><td><button className="text-btn" disabled={busyUser===u.id} onClick={()=>toggleActive(u.id,!u.active)}>{u.active?'Deactivate':'Reactivate'}</button></td></tr>)}</tbody></table></div></section></div>
}

function EquipmentDrawer({item,loading,error,onClose,onOpenDimension,onCreateAction,onRecordReading,recordReadingOpen,setRecordReadingOpen,readingParameter,setReadingParameter,readingValue,setReadingValue,readingUnit,setReadingUnit,readingObservedAt,setReadingObservedAt,readingNote,setReadingNote,onSaveReading,readingSaving,onOpenAction}:{item:Equipment;loading:boolean;error:string;onClose:()=>void;onOpenDimension:(type:DimensionType,id:number|undefined)=>void;onCreateAction:()=>void;onRecordReading:()=>void;recordReadingOpen:boolean;setRecordReadingOpen:(v:boolean)=>void;readingParameter:'Welding Current'|'Pressure';setReadingParameter:(v:'Welding Current'|'Pressure')=>void;readingValue:string;setReadingValue:(v:string)=>void;readingUnit:string;setReadingUnit:(v:string)=>void;readingObservedAt:string;setReadingObservedAt:(v:string)=>void;readingNote:string;setReadingNote:(v:string)=>void;onSaveReading:(e:FormEvent)=>void;readingSaving:boolean;onOpenAction:(a:CorrectiveAction)=>void}) {
  const current = item.current_status; const pressure = item.pressure_status
  return <div className="drawer-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="detail-drawer"><div className="drawer-head"><div><div className="eyebrow">EQUIPMENT DETAIL</div><h2>{item.po_gun_id}</h2><p>{item.car_model} · {item.zone} · {item.process}</p></div><button className="icon-btn" onClick={onClose} aria-label="Close details"><X size={20}/></button></div>{error&&<div className="alert alert-error drawer-alert">{error}</div>}{loading?<LoadingInline/>:<><div className="drawer-status-row"><StatusPill status={item.overall_status}/><span>Source row {item.source_row||'—'} · {item.snapshot_label||'Current record'}</span></div><div className="drawer-dimension-links"><button onClick={()=>onOpenDimension('process',item.process_pk)}><span>PROCESS</span><b>{item.process}</b><ArrowRight size={14}/></button><button onClick={()=>onOpenDimension('transformer',item.transformer_pk)}><span>TRANSFORMER</span><b>{item.transformer_id}</b><ArrowRight size={14}/></button><button onClick={()=>onOpenDimension('po_gun',item.po_gun_pk)}><span>PO GUN</span><b>{item.po_gun_id}</b><ArrowRight size={14}/></button></div><section className="parameter-card"><div className="parameter-head"><div><Gauge size={17}/><b>Welding current</b></div><StatusPill status={current}/></div><div className="parameter-main-value"><b>{fmt(item.current_actual)}</b><span>{item.current_unit}</span></div><div className="target-deviation-row"><span>Target <b>{fmt(item.current_target)}</b></span><span>Deviation <b className={item.current_deviation==null?'':item.current_deviation===0?'': 'deviation-value'}>{fmt(item.current_deviation)}</b>{item.current_deviation_percent!=null&&<small> ({fmt(item.current_deviation_percent,1)}%)</small>}</span></div><div className="range-gauge"><div className="range-labels"><span>Min {fmt(item.current_min)}</span><span>Max {fmt(item.current_max)}</span></div><div className="range-bar"><span className="range-acceptable"/><i className={current==='NG'?'range-pointer range-pointer-ng':'range-pointer'} style={{left:rangePosition(item.current_actual,item.current_min,item.current_max)}}/></div></div></section><section className="parameter-card"><div className="parameter-head"><div><Activity size={17}/><b>Welding pressure</b></div><StatusPill status={pressure}/></div><div className="parameter-main-value"><b>{fmt(item.pressure_actual)}</b><span>{item.pressure_unit}</span></div><div className="target-deviation-row"><span>Target <b>{fmt(item.pressure_target)}</b></span><span>Deviation <b className={item.pressure_deviation==null?'':item.pressure_deviation===0?'':'deviation-value'}>{fmt(item.pressure_deviation)}</b>{item.pressure_deviation_percent!=null&&<small> ({fmt(item.pressure_deviation_percent,1)}%)</small>}</span></div><div className="range-gauge"><div className="range-labels"><span>Min {fmt(item.pressure_min)}</span><span>Max {fmt(item.pressure_max)}</span></div><div className="range-bar"><span className="range-acceptable"/><i className={pressure==='NG'?'range-pointer range-pointer-ng':'range-pointer'} style={{left:rangePosition(item.pressure_actual,item.pressure_min,item.pressure_max)}}/></div></div></section><div className="recommendation-box"><div><Wrench size={17}/><b>Inspection guidance</b></div><p>{item.overall_status==='NG'?'Escalate for engineering review: confirm the measurement, approved limits, gun condition, and applicable work instruction. Do not automatically change a machine setpoint.':item.overall_status==='UNVERIFIED'?'Verify missing or invalid readings, approved limits, and measurement units before classifying the equipment.':'Readings are within the stored limits. Monitor target drift and follow the approved inspection schedule.'}</p></div><div className="drawer-actions"><button className="btn btn-primary" onClick={onCreateAction}><ClipboardCheck size={16}/> Create corrective action</button><button className="btn btn-outline" onClick={onRecordReading}><Activity size={16}/> Record reading</button></div>{recordReadingOpen&&<form className="reading-form" onSubmit={onSaveReading}><div className="form-title"><b>Record parameter reading</b><button className="icon-btn" type="button" onClick={()=>setRecordReadingOpen(false)}><X size={16}/></button></div><label>Parameter<select value={readingParameter} onChange={e=>{const v=e.target.value as 'Welding Current'|'Pressure';setReadingParameter(v);setReadingUnit(v==='Welding Current'?item.current_unit:item.pressure_unit)}}><option>Welding Current</option><option>Pressure</option></select></label><div className="form-grid"><label>Actual value<input required type="number" step="any" value={readingValue} onChange={e=>setReadingValue(e.target.value)}/></label><label>Unit<input required value={readingUnit} onChange={e=>setReadingUnit(e.target.value)} readOnly/></label><label>Observed at<input required type="datetime-local" value={readingObservedAt} onChange={e=>setReadingObservedAt(e.target.value)}/></label><label>Note<input value={readingNote} onChange={e=>setReadingNote(e.target.value)} placeholder="Optional"/></label></div><div className="unit-warning"><AlertTriangle size={14}/> Source units are not labelled; values must be entered in the same source unit as the limits.</div><button className="btn btn-primary wide" disabled={readingSaving}>{readingSaving?'Saving…':'Save & recalculate status'}</button></form>}<section className="drawer-history"><SectionTitle title="Parameter history" subtitle="Imported readings have no confirmed observation date."/>{(item.readings||[]).length>0?<div className="reading-history-list">{(item.readings||[]).slice(0,8).map((r:any)=><div key={r.id}><div><b>{r.parameter_name}</b><span>{fmt(r.value)} {r.unit}</span></div><small>{r.observed_at?new Date(r.observed_at).toLocaleString():'Observation date not supplied'} · {r.source}</small></div>)}</div>:<p className="small-muted">No timestamped readings have been recorded for this equipment.</p>}</section><section className="drawer-history"><SectionTitle title="Linked corrective actions" subtitle="Traceable work records"/>{(item.corrective_actions||[]).length>0?<div className="reading-history-list">{(item.corrective_actions||[]).map((a:CorrectiveAction)=><button key={a.id} className="linked-action-row" onClick={()=>onOpenAction(a)}><div><b>{a.display_id}</b><StatusPill status={a.action_status}/></div><small>{a.problem_description||'No description'} · due {niceDate(a.due_date)}</small></button>)}</div>:<p className="small-muted">No corrective action is linked to this equipment.</p>}</section></>}</aside></div>
}
function rangePosition(actual:number|null|undefined,min:number|null|undefined,max:number|null|undefined) { if(actual==null||min==null||max==null||max<=min) return '50%'; return `${Math.max(0,Math.min(100,(actual-min)/(max-min)*100))}%` }

function DimensionDrawer({value,loading,onClose,onOpenEquipment,onOpenDimension}:{value:{type:DimensionType;data:any};loading:boolean;onClose:()=>void;onOpenEquipment:(x:Equipment)=>void;onOpenDimension:(t:DimensionType,id:number|undefined)=>void}) {
  const data=value.data; const isProcess=value.type==='process'; const isTransformer=value.type==='transformer'; const title=isProcess?data.process:isTransformer?data.transformer_id:data.po_gun_id
  const equip:Equipment[]=data.equipment||[]
  return <div className="drawer-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="detail-drawer dimension-drawer"><div className="drawer-head"><div><div className="eyebrow">{value.type.replace('_',' ').toUpperCase()} DETAILS</div><h2>{title}</h2><p>{data.zone} · {data.process||''}</p></div><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>{loading?<LoadingInline/>:<><div className="process-kpis"><MiniStat label="Equipment" value={data.total||0}/><MiniStat label="OK" value={data.ok||0} tone="green"/><MiniStat label="NG" value={data.ng||0} tone="red"/><MiniStat label="Unverified" value={data.unverified||0} tone="amber"/></div>{isProcess&&<div className="dimension-context"><b>Transformers</b><div>{(data.transformers||[]).map((x:string)=><span key={x} className="pill-tag">{x}</span>)}</div><b>PO Guns</b><div>{(data.po_guns||[]).map((x:string)=><span key={x} className="pill-tag">{x}</span>)}</div><p>Coordinates: {data.coordinates_verified?'verified':'not verified'} · {data.map_position||'No map label'}</p></div>}{isTransformer&&<div className="dimension-context"><b>Associated models</b><div>{(data.models||[]).map((x:string)=><span key={x} className="pill-tag">{x}</span>)}</div><b>Connected PO Guns</b><div>{(data.po_guns||[]).map((code:string)=><span key={code} className="pill-tag">{code}</span>)}</div></div>}{!isProcess&&!isTransformer&&<div className="dimension-context"><b>Transformer</b><div><span className="pill-tag">{data.transformer_id}</span></div><b>Gun type</b><p>{data.gun_type||'Not specified in source register'}</p></div>}<SectionTitle title="Linked equipment" subtitle="Click a row for detailed parameters."/><div className="linked-equipment-list">{equip.map(x=><button key={x.id} className="linked-equipment-row" onClick={()=>{onClose();onOpenEquipment(x)}}><div><b>{x.car_model} · {x.po_gun_id}</b><span>{x.process} · {x.transformer_id}</span></div><StatusPill status={x.overall_status}/><ArrowRight size={14}/></button>)}{equip.length===0&&<EmptyState title="No linked equipment in this filter" detail="Choose another car model or clear the model filter."/>}</div></>}</aside></div>
}

function Modal({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void}) {
  return <div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal-card"><div className="modal-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>{children}</section></div>
}
