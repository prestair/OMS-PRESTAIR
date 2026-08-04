import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const ALL_COLUMNS = [
  { key: 'date', label: 'Date' },{ key: 'poNo', label: 'PO No' },{ key: 'client', label: 'Client' },{ key: 'orderNo', label: 'Order No' },{ key: 'photography', label: 'Photography' },{ key: 'photographyRemarks', label: 'Photography Remarks' },{ key: 'siteVideo', label: 'Site Video' },{ key: 'siteVideoRemarks', label: 'Site Video Remarks' },{ key: 'review', label: 'Review' },{ key: 'reviewRemarks', label: 'Review Remarks' },{ key: 'status', label: 'Status' },{ key: 'deliveryDate', label: 'Delivery Date' },{ key: 'deliveryRemarks', label: 'Delivery Remarks' },{ key: 'customerName', label: 'Customer Name' },{ key: 'gst', label: 'GST' },{ key: 'billingAddress', label: 'Billing Address' },{ key: 'followUp', label: 'Follow Up' },{ key: 'salesRep', label: 'Sales Rep' },{ key: 'deliveryAddress', label: 'Delivery Address' },{ key: 'phoneNo', label: 'Phone No' },{ key: 'siteVerification', label: 'Site Verification' },{ key: 'siteVerificationRemarks', label: 'SV Remarks' },{ key: 'installationStatus', label: 'Installation Status' },{ key: 'installationRemarks', label: 'Inst. Remarks' },{ key: 'lop', label: 'LOP' },{ key: 'sectionDrawing', label: 'Section Drawing' },{ key: 'sectionDrawingRemarks', label: 'SD Remarks' },{ key: 'inProduction', label: 'In Production' },{ key: 'billing', label: 'Billing' },{ key: 'installation', label: 'Installation' },{ key: 'totalAmount', label: 'Total Amount' },{ key: 'receivedAmount', label: 'Received' },{ key: 'balance', label: 'Balance' },{ key: 'percentReceived', label: '% Rcv' },{ key: 'paymentRemarks', label: 'Payment Remarks' },{ key: 'daysToOrder', label: 'Days to Order' },{ key: 'remarks', label: 'Remarks' },{ key: 'akhilSirAudit', label: 'Akhil Sir Audit' },{ key: 'advanceBill', label: 'Advance Bill' },{ key: 'orRecvd', label: 'OR Recvd' }
]

function UserManagement() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', fullName: '', role: 'user', group: '', columnPermissions: {}, canEdit: false, canReceipt: false, canAssignReminder: false, canDelete: false })
  const [resetPassword, setResetPassword] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupForm, setGroupForm] = useState({ name: '', columnPermissions: {}, canEdit: false, canReceipt: false, canAssignReminder: false, canDelete: false })

  useEffect(() => { fetchUsers(); fetchGroups() }, [])
  const fetchUsers = async () => { try { setUsers((await axios.get('/api/users')).data) } catch {} }
  const fetchGroups = async () => { try { setGroups((await axios.get('/api/users/groups')).data) } catch {} }

  // When group changes on user form, auto-fill rights from group
  const applyGroupRights = (groupName) => {
    const g = groups.find(x => x.name === groupName)
    if (g) {
      setForm(prev => ({ ...prev, group: groupName, canEdit: g.canEdit, canReceipt: g.canReceipt, canAssignReminder: g.canAssignReminder, canDelete: g.canDelete, canCreateQuote: g.canCreateQuote || false, columnPermissions: { ...g.columnPermissions } }))
    } else {
      setForm(prev => ({ ...prev, group: groupName }))
    }
  }

  const resetToGroupRights = () => {
    const g = groups.find(x => x.name === form.group)
    if (g) {
      setForm(prev => ({ ...prev, canEdit: g.canEdit, canReceipt: g.canReceipt, canAssignReminder: g.canAssignReminder, canDelete: g.canDelete, canCreateQuote: g.canCreateQuote || false, columnPermissions: { ...g.columnPermissions } }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.group && form.role !== 'admin') { setError('Group is mandatory'); return }
    try {
      if (editingUser) {
        await axios.put(`/api/users/${editingUser.id}`, { fullName: form.fullName, role: form.role, group: form.group, columnPermissions: form.columnPermissions, canEdit: form.canEdit, canReceipt: form.canReceipt, canAssignReminder: form.canAssignReminder, canDelete: form.canDelete, canCreateQuote: form.canCreateQuote })
      } else {
        await axios.post('/api/users', form)
      }
      setShowForm(false); setEditingUser(null); fetchUsers()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
  }

  const handleGroupSubmit = async () => {
    if (!groupForm.name.trim()) { alert('Group name required'); return }
    try {
      if (editingGroup) await axios.put(`/api/users/groups/${editingGroup.id}`, groupForm)
      else await axios.post('/api/users/groups', groupForm)
      fetchGroups(); setEditingGroup(null); setGroupForm({ name: '', columnPermissions: {}, canEdit: false, canReceipt: false, canAssignReminder: false, canDelete: false })
    } catch (err) { alert(err.response?.data?.error || 'Failed') }
  }

  return (
    <div style={s.wrapper}>
      <header style={s.header}>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <h1 style={{ fontSize:'20px', fontWeight:'700', margin:0 }}>User Management</h1>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => navigate('/dashboard')} style={s.hBtn}>Back to Dashboard</button>
          <button onClick={logout} style={{ ...s.hBtn, background:'#e74c3c' }}>Logout</button>
        </div>
      </header>

      <div style={{ padding:'20px', maxWidth:'1100px', margin:'0 auto', overflowX:'auto' }}>
        <div style={{ marginBottom:'12px', display:'flex', gap:'10px' }}>
          <button onClick={() => { setEditingUser(null); setForm({ username:'', password:'', fullName:'', role:'user', group:'', columnPermissions:{}, canEdit:false, canReceipt:false, canAssignReminder:false, canDelete:false }); setShowForm(true) }} style={s.addBtn}>+ Add User</button>
          <button onClick={() => { setEditingGroup(null); setGroupForm({ name:'', columnPermissions:{}, canEdit:false, canReceipt:false, canAssignReminder:false, canDelete:false }); setShowGroupForm(true) }} style={{ ...s.addBtn, background:'#8e44ad' }}>Manage Groups</button>
        </div>

        <table style={s.table}><thead><tr>
          <th style={s.th}>#</th><th style={s.th}>Username</th><th style={s.th}>Full Name</th><th style={s.th}>Role</th><th style={s.th}>Group</th><th style={s.th}>Actions</th>
        </tr></thead><tbody>
          {users.map((u, i) => (
            <tr key={u.id} style={i%2?{background:'#f8f9fa'}:{}}>
              <td style={s.td}>{i+1}</td><td style={s.td}>{u.username}</td><td style={s.td}>{u.fullName}</td>
              <td style={s.td}><span style={u.role==='admin'?s.badgeA:s.badgeU}>{u.role}</span></td>
              <td style={s.td}>{u.group||'-'}</td>
              <td style={s.td}>
                <button onClick={() => { setEditingUser(u); setForm({ username:u.username, password:'', fullName:u.fullName, role:u.role, group:u.group||'', columnPermissions:u.columnPermissions||{}, canEdit:u.canEdit!==undefined?u.canEdit:false, canReceipt:u.canReceipt!==undefined?u.canReceipt:false, canAssignReminder:u.canAssignReminder||false, canDelete:u.canDelete||false, canCreateQuote:u.canCreateQuote||false }); setShowForm(true) }} style={s.tBtn}>Edit</button>
                <button onClick={() => setResetPassword(u)} style={{...s.tBtn,background:'#f39c12'}}>Pass</button>
                {u.id!==user.id && <button onClick={async()=>{if(window.confirm('Delete?')){await axios.delete(`/api/users/${u.id}`);fetchUsers()}}} style={{...s.tBtn,background:'#e74c3c'}}>Del</button>}
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {/* User Form */}
      {showForm && (
        <div style={s.overlay}><div style={{ ...s.modal, maxWidth:'820px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <h3 style={{ margin:0 }}>{editingUser ? 'Edit User' : 'Add New User'}</h3>
            <button onClick={()=>setShowForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', fontWeight:'700' }}>X</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'12px' }}>
              {!editingUser && <div style={s.f}><label style={s.l}>Username</label><input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} style={s.i} required/></div>}
              {!editingUser && <div style={s.f}><label style={s.l}>Password</label><input type={showPass?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} style={s.i} required/></div>}
              <div style={s.f}><label style={s.l}>Full Name</label><input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} style={s.i} required/></div>
              <div style={s.f}><label style={s.l}>Role</label><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} style={s.i}><option value="user">User</option><option value="admin">Admin</option></select></div>
              <div style={s.f}><label style={s.l}>Group *</label><select value={form.group} onChange={e=>applyGroupRights(e.target.value)} style={s.i}><option value="">-- Select Group --</option>{groups.map(g=><option key={g.id} value={g.name}>{g.name}</option>)}</select></div>
            </div>

            {form.role !== 'admin' && <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:'12px', fontWeight:'700' }}>Rights & Column Permissions</span>
                <button type="button" onClick={resetToGroupRights} style={{ padding:'4px 10px', background:'#f39c12', color:'#fff', border:'none', borderRadius:'4px', fontSize:'10px', cursor:'pointer', fontWeight:'600' }}>Reset to Group</button>
              </div>
              <div style={{ display:'flex', gap:'14px', marginBottom:'10px', flexWrap:'wrap', padding:'8px', background:'#f0f8ff', borderRadius:'6px' }}>
                <label style={s.tl}><input type="checkbox" checked={form.canEdit} onChange={e=>setForm({...form,canEdit:e.target.checked})}/><span>Edit</span></label>
                <label style={s.tl}><input type="checkbox" checked={form.canReceipt} onChange={e=>setForm({...form,canReceipt:e.target.checked})}/><span>Receipt</span></label>
                <label style={s.tl}><input type="checkbox" checked={form.canAssignReminder} onChange={e=>setForm({...form,canAssignReminder:e.target.checked})}/><span>Assign Reminder</span></label>
                <label style={s.tl}><input type="checkbox" checked={form.canDelete} onChange={e=>setForm({...form,canDelete:e.target.checked})}/><span>Delete</span></label>
                <label style={s.tl}><input type="checkbox" checked={form.canCreateQuote||false} onChange={e=>setForm({...form,canCreateQuote:e.target.checked})}/><span>Create Order</span></label>
              </div>
              <div style={{ maxHeight:'200px', overflow:'auto', border:'1px solid #e0e0e0', borderRadius:'6px', padding:'8px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'4px' }}>
                  {ALL_COLUMNS.map(col => (
                    <div key={col.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'3px 5px', background:'#f8f9fa', borderRadius:'3px' }}>
                      <span style={{ fontSize:'10px', fontWeight:'500' }}>{col.label}</span>
                      <select value={form.columnPermissions[col.key]||'none'} onChange={e=>{const p={...form.columnPermissions};if(e.target.value==='none')delete p[col.key];else p[col.key]=e.target.value;setForm({...form,columnPermissions:p})}} style={{ padding:'2px 4px', border:'1px solid #ddd', borderRadius:'3px', fontSize:'10px', width:'80px' }}>
                        <option value="none">None</option><option value="view">View</option><option value="edit">Edit</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </>}

            {error && <p style={{ color:'#e74c3c', fontSize:'12px', margin:'8px 0 0' }}>{error}</p>}
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'12px' }}>
              <button type="button" onClick={()=>setShowForm(false)} style={s.cBtn}>Cancel</button>
              <button type="submit" style={s.sBtn}>{editingUser?'Save':'Create User'}</button>
            </div>
          </form>
        </div></div>
      )}

      {/* Reset Password */}
      {resetPassword && (
        <div style={s.overlay}><div style={s.modal}>
          <h3>Reset Password: {resetPassword.username}</h3>
          <div style={{background:'#f8f9fa',padding:'10px',borderRadius:'6px',marginTop:'10px'}}>
            <span style={{fontSize:'12px',fontWeight:'600',color:'#555'}}>Current Password: </span>
            <span style={{fontSize:'14px',fontWeight:'700',color:'#e74c3c'}}>{resetPassword.plainPassword || '(not available)'}</span>
          </div>
          <input type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={{...s.i,marginTop:'10px'}} placeholder="Enter new password"/>
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'12px' }}>
            <button onClick={()=>{setResetPassword(null);setNewPassword('')}} style={s.cBtn}>Cancel</button>
            <button onClick={async()=>{if(!newPassword||newPassword.length<3){alert('Min 3 chars');return};try{await axios.put('/api/users/'+resetPassword.id+'/password',{newPassword});alert('Password reset done!');setResetPassword(null);setNewPassword('');fetchUsers()}catch(err){alert('Error: '+(err.response?.data?.error||err.message))}}} style={s.sBtn}>Reset</button>
          </div>
        </div></div>
      )}

      {/* Group Management */}
      {showGroupForm && (
        <div style={s.overlay}><div style={{ ...s.modal, maxWidth: editingGroup ? '95vw' : '450px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <h3 style={{ margin:0 }}>Manage Groups</h3>
            <button onClick={()=>setShowGroupForm(false)} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', fontWeight:'700' }}>X</button>
          </div>
          {/* Groups List - compact */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'12px' }}>
            {groups.map(g => (
              <div key={g.id} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'4px 8px', background:'#f0f0f0', borderRadius:'4px', fontSize:'11px' }}>
                <strong>{g.name}</strong>
                <button onClick={()=>{setEditingGroup(g);setGroupForm({name:g.name,columnPermissions:g.columnPermissions||{},canEdit:g.canEdit,canReceipt:g.canReceipt,canAssignReminder:g.canAssignReminder,canDelete:g.canDelete})}} style={{ background:'#2980b9', color:'#fff', border:'none', borderRadius:'2px', fontSize:'9px', padding:'2px 5px', cursor:'pointer' }}>Edit</button>
                <button onClick={async()=>{if(window.confirm(`Delete ${g.name}?`)){await axios.delete(`/api/users/groups/${g.id}`);fetchGroups()}}} style={{ background:'#e74c3c', color:'#fff', border:'none', borderRadius:'2px', fontSize:'9px', padding:'2px 5px', cursor:'pointer' }}>Del</button>
              </div>
            ))}
            <button onClick={()=>{setEditingGroup(null);setGroupForm({name:'',columnPermissions:{},canEdit:false,canReceipt:false,canAssignReminder:false,canDelete:false})}} style={{ padding:'4px 10px', background:'#27ae60', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'600' }}>+ Add Group</button>
          </div>

          {/* Edit/Add Form - only when editing or adding */}
          {(editingGroup || groupForm.name !== '' || !groups.length) && <>
            <div style={{ borderTop:'1px solid #eee', paddingTop:'10px' }}>
              <h4 style={{ margin:'0 0 8px', fontSize:'12px' }}>{editingGroup ? `Edit: ${editingGroup.name}` : 'New Group'}</h4>
              <div style={s.f}><label style={s.l}>Name</label><input value={groupForm.name} onChange={e=>setGroupForm({...groupForm,name:e.target.value})} style={{...s.i,textTransform:'uppercase'}} placeholder="e.g. PRODUCTION"/></div>
              <div style={{ display:'flex', gap:'12px', margin:'8px 0', flexWrap:'wrap', padding:'6px 8px', background:'#f0f8ff', borderRadius:'5px' }}>
                <label style={s.tl}><input type="checkbox" checked={groupForm.canEdit} onChange={e=>setGroupForm({...groupForm,canEdit:e.target.checked})}/><span>Edit</span></label>
                <label style={s.tl}><input type="checkbox" checked={groupForm.canReceipt} onChange={e=>setGroupForm({...groupForm,canReceipt:e.target.checked})}/><span>Receipt</span></label>
                <label style={s.tl}><input type="checkbox" checked={groupForm.canAssignReminder} onChange={e=>setGroupForm({...groupForm,canAssignReminder:e.target.checked})}/><span>Reminder</span></label>
                <label style={s.tl}><input type="checkbox" checked={groupForm.canDelete} onChange={e=>setGroupForm({...groupForm,canDelete:e.target.checked})}/><span>Delete</span></label>
            <label style={s.tl}><input type="checkbox" checked={groupForm.canCreateQuote||false} onChange={e=>setGroupForm({...groupForm,canCreateQuote:e.target.checked})}/><span>Create Order</span></label>
              </div>
              <div style={{ border:'1px solid #e0e0e0', borderRadius:'5px', padding:'6px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'3px' }}>
                  {ALL_COLUMNS.map(col => (
                    <div key={col.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'2px 4px', background:'#f8f9fa', borderRadius:'3px' }}>
                      <span style={{ fontSize:'9px', fontWeight:'500' }}>{col.label}</span>
                      <select value={groupForm.columnPermissions[col.key]||'none'} onChange={e=>{const p={...groupForm.columnPermissions};if(e.target.value==='none')delete p[col.key];else p[col.key]=e.target.value;setGroupForm({...groupForm,columnPermissions:p})}} style={{ padding:'1px 3px', border:'1px solid #ddd', borderRadius:'2px', fontSize:'9px', width:'55px' }}>
                        <option value="none">None</option><option value="view">View</option><option value="edit">Edit</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'10px' }}>
                <button onClick={()=>{setEditingGroup(null);setGroupForm({name:'',columnPermissions:{},canEdit:false,canReceipt:false,canAssignReminder:false,canDelete:false})}} style={s.cBtn}>Cancel</button>
                <button onClick={handleGroupSubmit} style={s.sBtn}>{editingGroup?'Update':'Save'}</button>
              </div>
            </div>
          </>}
        </div></div>
      )}
    </div>
  )
}

const s = {
  wrapper: { minHeight:'100vh', background:'#f0f2f5' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 24px', background:'#1a1a2e', color:'#fff' },
  hBtn: { padding:'7px 12px', background:'#2980b9', color:'#fff', border:'none', borderRadius:'5px', fontSize:'11px', fontWeight:'600', cursor:'pointer' },
  addBtn: { padding:'9px 16px', background:'#27ae60', color:'#fff', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:'600', cursor:'pointer' },
  table: { width:'100%', borderCollapse:'collapse', background:'#fff', borderRadius:'8px', overflow:'hidden', boxShadow:'0 2px 6px rgba(0,0,0,0.07)' },
  th: { padding:'10px', background:'#1a1a2e', color:'#fff', fontWeight:'600', textAlign:'left', fontSize:'12px', whiteSpace:'nowrap' },
  td: { padding:'8px 10px', borderBottom:'1px solid #eee', fontSize:'12px' },
  tBtn: { padding:'3px 8px', background:'#2980b9', color:'#fff', border:'none', borderRadius:'3px', fontSize:'10px', cursor:'pointer', marginRight:'3px' },
  badgeA: { padding:'2px 6px', background:'#e74c3c', color:'#fff', borderRadius:'3px', fontSize:'10px', fontWeight:'600' },
  badgeU: { padding:'2px 6px', background:'#27ae60', color:'#fff', borderRadius:'3px', fontSize:'10px', fontWeight:'600' },
  overlay: { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'flex-start', zIndex:1000, padding:'30px 20px', overflow:'auto' },
  modal: { background:'#fff', borderRadius:'10px', padding:'24px', width:'100%', maxWidth:'420px' },
  f: { display:'flex', flexDirection:'column', gap:'3px', marginBottom:'8px' },
  l: { fontSize:'11px', fontWeight:'600', color:'#555' },
  i: { padding:'8px 10px', border:'1px solid #ddd', borderRadius:'5px', fontSize:'13px', width:'100%', boxSizing:'border-box' },
  tl: { display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', fontWeight:'500', cursor:'pointer' },
  cBtn: { padding:'8px 16px', background:'#eee', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'600', fontSize:'12px' },
  sBtn: { padding:'8px 16px', background:'#1a1a2e', color:'#fff', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'600', fontSize:'12px' }
}

export default UserManagement

