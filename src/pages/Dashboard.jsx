import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import * as XLSX from 'xlsx-js-style'
import { useAuth } from '../context/AuthContext'
import OrderForm from '../components/OrderForm'
import PaymentForm from '../components/PaymentForm'
import ReminderForm from '../components/ReminderForm'
import ReminderPopup from '../components/ReminderPopup'

const ALL_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'poNo', label: 'PO No' },
  { key: 'client', label: 'Client' },
  { key: 'orderNo', label: 'Order No' },
  { key: 'photography', label: 'Photography' },
  { key: 'photographyRemarks', label: 'Photography Remarks' },
  { key: 'siteVideo', label: 'Site Video' },
  { key: 'siteVideoRemarks', label: 'Site Video Remarks' },
  { key: 'review', label: 'Review' },
  { key: 'reviewRemarks', label: 'Review Remarks' },
  { key: 'status', label: 'DOD Status' },
  { key: 'deliveryDate', label: 'Delivery Date' },
  { key: 'deliveryRemarks', label: 'Delivery Remarks' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'gst', label: 'GST' },
  { key: 'billingAddress', label: 'Billing Address' },
  { key: 'followUp', label: 'Follow Up' },
  { key: 'salesRep', label: 'Sales Rep' },
  { key: 'deliveryAddress', label: 'Delivery Address' },
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'siteVerification', label: 'Site Verification' },
  { key: 'siteVerificationRemarks', label: 'Site Verification Remarks' },
  { key: 'installationStatus', label: 'Installation Status' },
  { key: 'installationRemarks', label: 'Installation Remarks' },
  { key: 'lop', label: 'LOP' },
  { key: 'sectionDrawing', label: 'Section Drawing' },
  { key: 'sectionDrawingRemarks', label: 'SD Remarks' },
  { key: 'inProduction', label: 'In Production' },
  { key: 'installation', label: 'Seasonal Discount' },
  { key: 'totalAmount', label: 'Total Amount' },
  { key: 'receivedAmount', label: 'Received' },
  { key: 'balance', label: 'Balance' },
  { key: 'percentReceived', label: '% Rcv' },
  { key: 'paymentRemarks', label: 'Payment Remarks' },
  { key: 'daysToOrder', label: 'Days to Order' },
  { key: 'akhilSirAudit', label: 'Akhil Sir Audit' },
  { key: 'remarks', label: 'Audit Remarks' },
  { key: 'advanceBill', label: 'Advance Bill' },
  { key: 'orRecvd', label: 'OR Recvd' }
]

const DEFAULT_VISIBLE = ['date', 'poNo', 'client', 'orderNo', 'status', 'customerName', 'salesRep', 'totalAmount', 'receivedAmount', 'balance', 'percentReceived']

function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [filteredOrders, setFilteredOrders] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrders, setSelectedOrders] = useState([])
  const [showSearchDrop, setShowSearchDrop] = useState(false)
  const [deletedSearchTerm, setDeletedSearchTerm] = useState('')
  const [selectedDeletedOrders, setSelectedDeletedOrders] = useState([])
  const [showDeletedSearchDrop, setShowDeletedSearchDrop] = useState(false)
  const [statusCheckSearch, setStatusCheckSearch] = useState('')
  const [statusCheckResults, setStatusCheckResults] = useState([])
  const [activePage, setActivePage] = useState(1)
  const [deletedPage, setDeletedPage] = useState(1)
  const ORDERS_PER_PAGE = 10
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(`oms_columns_${user.username}`)
    return saved ? JSON.parse(saved) : DEFAULT_VISIBLE
  })
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [editingDeleted, setEditingDeleted] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(null)
  const [importDuplicates, setImportDuplicates] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [columnFilters, setColumnFilters] = useState({})
  const [openFilter, setOpenFilter] = useState(null)
  const [showReminderForm, setShowReminderForm] = useState(null)
  const [showReminderPopup, setShowReminderPopup] = useState(true)
  const [paperIssuePopup, setPaperIssuePopup] = useState([])
  const [activeTab, setActiveTab] = useState('active')
  const [deletedOrders, setDeletedOrders] = useState([])
  const [dailyFilter, setDailyFilter] = useState('')
  const [dailyFilterValue, setDailyFilterValue] = useState([])
  const [dailyLopFilter, setDailyLopFilter] = useState([])
  const [dailyPercentMax, setDailyPercentMax] = useState('')
  const [dailyPercentDateFrom, setDailyPercentDateFrom] = useState('')
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [selectedRep, setSelectedRep] = useState(null)
  const [selectedPayStatus, setSelectedPayStatus] = useState(null)
  const [paperRequests, setPaperRequests] = useState([])
  const [myPaperRequests, setMyPaperRequests] = useState([])
  const [paperOrderNo, setPaperOrderNo] = useState([])
  const [paperIssueTo, setPaperIssueTo] = useState('')
  const [paperOrderSearch, setPaperOrderSearch] = useState('')
  const [paperUserSearch, setPaperUserSearch] = useState('')
  const [showOrderDropdown, setShowOrderDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [rerouteId, setRerouteId] = useState(null)
  const [rerouteTo, setRerouteTo] = useState('')
  const [rerouteSearch, setRerouteSearch] = useState('')
  const [showRerouteDrop, setShowRerouteDrop] = useState(false)
  const [returnOrderNo, setReturnOrderNo] = useState([])
  const [returnOrderSearch, setReturnOrderSearch] = useState('')
  const [returnIssueTo, setReturnIssueTo] = useState('')
  const [returnUserSearch, setReturnUserSearch] = useState('')
  const [showReturnOrderDrop, setShowReturnOrderDrop] = useState(false)
  const [showReturnUserDrop, setShowReturnUserDrop] = useState(false)
  const [returnRequests, setReturnRequests] = useState([])
  const [myReturnRequests, setMyReturnRequests] = useState([])
  const [editRequestId, setEditRequestId] = useState(null)
  const [editRequestType, setEditRequestType] = useState('')
  const [editRequestUser, setEditRequestUser] = useState('')
  const [editRequestSearch, setEditRequestSearch] = useState('')
  const [showEditRequestDrop, setShowEditRequestDrop] = useState(false)
  const [allUsers, setAllUsers] = useState([])
  const [colorFilter, setColorFilter] = useState([])
  const [allPayments, setAllPayments] = useState([])
  const [paymentDateFrom, setPaymentDateFrom] = useState('')
  const [paymentDateTo, setPaymentDateTo] = useState('')
  const [receiptDrillDown, setReceiptDrillDown] = useState(null)
  const [editHistoryPopup, setEditHistoryPopup] = useState(null)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [allReminders, setAllReminders] = useState([])
  const [reassignId, setReassignId] = useState(null)
  const [reassignReason, setReassignReason] = useState('')
  const [reminderNotification, setReminderNotification] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [orTabSearch, setOrTabSearch] = useState('')
  const [orTabStatusFilter, setOrTabStatusFilter] = useState([])
  const [paperRequestSearch, setPaperRequestSearch] = useState('')
  const [paperIssueError, setPaperIssueError] = useState('')
  const [colWidthsState, setColWidthsState] = useState(() => {
    const saved = localStorage.getItem(`oms_col_widths_${user.username}`)
    return saved ? JSON.parse(saved) : {}
  })
  const resizingRef = useRef(null)
  const fileInputRef = useRef(null)
  const deletedFileInputRef = useRef(null)

  const handleResizeStart = (e, colKey) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = colWidthsState[colKey] || 120
    resizingRef.current = { colKey, startX, startWidth }
    const onMouseMove = (ev) => {
      if (!resizingRef.current) return
      const diff = ev.clientX - resizingRef.current.startX
      const newWidth = Math.max(40, resizingRef.current.startWidth + diff)
      setColWidthsState(prev => { const updated = { ...prev, [colKey]: newWidth }; localStorage.setItem(`oms_col_widths_${user.username}`, JSON.stringify(updated)); return updated })
    }
    const onMouseUp = () => {
      resizingRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Determine columns user is allowed to see
  const isAdmin = user.role === 'admin'
  const userPerms = user.columnPermissions || {}
  const canEditOrders = isAdmin || user.canEdit !== false
  const canAddReceipt = isAdmin || user.canReceipt !== false
  const canDeleteOrders = isAdmin || user.canDelete
  const canCreateQuote = isAdmin || user.canCreateQuote

  // canCreateQuote now controls "Add New Order" button visibility
  const canCreateOrder = canCreateQuote
  const canColor = isAdmin || user.canColor

  // Helper to get full name from username
  const getFullName = (username) => {
    if (!username) return '-'
    const u = allUsers.find(x => x.username === username)
    return u ? (u.full_name || u.fullName || u.username) : username
  }

  const getAllowedColumns = () => {
    if (isAdmin) return ALL_COLUMNS
    return ALL_COLUMNS.filter(col => userPerms[col.key] === 'view' || userPerms[col.key] === 'edit')
  }

  const canEditColumn = (key) => {
    if (isAdmin) return true
    return userPerms[key] === 'edit'
  }

  const allowedColumns = getAllowedColumns()

  useEffect(() => { fetchOrders(); fetchDeletedOrders(); fetchPaperRequests() }, [])

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => { fetchOrders(); fetchDeletedOrders(); fetchPaperRequests() }, 120000)
    return () => clearInterval(interval)
  }, [])

  // Auto-refresh reminders tab every 30 seconds
  useEffect(() => {
    if (activeTab === 'reminders') {
      fetchAllReminders()
      const interval = setInterval(fetchAllReminders, 30000)
      return () => clearInterval(interval)
    }
  }, [activeTab])

  // Check for new reminder responses (for reminder senders)
  useEffect(() => {
    let lastCheckedResponses = {}
    const checkNewResponses = async () => {
      try {
        const res = await axios.get('/api/orders/reminders/all')
        const myReminders = res.data.filter(r => r.createdBy === user.username || r.created_by === user.username)
        myReminders.forEach(r => {
          const key = `${r.id}_${r.respondedBy || r.responded_by || ''}`
          if ((r.respondedBy || r.responded_by) && !lastCheckedResponses[r.id] && lastCheckedResponses[r.id] !== undefined) {
            const responder = r.respondedBy || r.responded_by
            const responderName = allUsers.find(u => u.username === responder)
            const name = responderName ? (responderName.full_name || responderName.fullName || responder) : responder
            setReminderNotification({ name, id: r.id })
            setTimeout(() => setReminderNotification(null), 10000)
          }
          lastCheckedResponses[r.id] = r.respondedBy || r.responded_by || null
        })
      } catch {}
    }
    // Initialize on first load
    const init = async () => {
      try {
        const res = await axios.get('/api/orders/reminders/all')
        const myReminders = res.data.filter(r => r.createdBy === user.username || r.created_by === user.username)
        myReminders.forEach(r => { lastCheckedResponses[r.id] = r.respondedBy || r.responded_by || null })
      } catch {}
    }
    init()
    const interval = setInterval(checkNewResponses, 30000)
    return () => clearInterval(interval)
  }, [allUsers])
  useEffect(() => {
    let currentVersion = null
    const checkVersion = async () => {
      try {
        const res = await axios.get('/api/app-version')
        if (currentVersion === null) { currentVersion = res.data.version }
        else if (res.data.version !== currentVersion) { window.location.reload() }
      } catch {}
    }
    checkVersion()
    const interval = setInterval(checkVersion, 30000)
    return () => clearInterval(interval)
  }, [])

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Paper issue popup - check every 2 minutes
  useEffect(() => {
    let prevCount = 0
    const checkPaperRequests = async () => {
      try {
        const [issueRes, returnRes] = await Promise.all([
          axios.get('/api/orders/paper-requests/my'),
          axios.get('/api/orders/return-requests/my')
        ])
        const issueData = issueRes.data || []
        const returnData = returnRes.data || []
        const totalCount = issueData.length + returnData.length
        if (issueData.length > 0) setPaperIssuePopup(issueData)
        // Send desktop notification if new requests arrived
        if (totalCount > prevCount && prevCount !== 0) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const newIssue = issueData.length > 0 ? `${issueData.length} Issue Request` : ''
            const newReturn = returnData.length > 0 ? `${returnData.length} Return Request` : ''
            const body = [newIssue, newReturn].filter(Boolean).join(' + ')
            new Notification('OMS - Paper Request', { body: body + ' pending!', icon: '/logo.PNG', tag: 'paper-request', requireInteraction: true })
          }
        } else if (prevCount === 0 && totalCount > 0) {
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            const newIssue = issueData.length > 0 ? `${issueData.length} Issue Request` : ''
            const newReturn = returnData.length > 0 ? `${returnData.length} Return Request` : ''
            const body = [newIssue, newReturn].filter(Boolean).join(' + ')
            new Notification('OMS - Paper Request', { body: body + ' pending!', icon: '/logo.PNG', tag: 'paper-request', requireInteraction: true })
          }
        }
        prevCount = totalCount
      } catch {}
    }
    checkPaperRequests()
    const interval = setInterval(checkPaperRequests, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let result = orders

    // Apply search
    if (selectedOrders.length > 0) {
      result = result.filter(o => selectedOrders.includes(o.orderNo))
    } else if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(o =>
        (o.orderNo || '').toLowerCase().includes(term) ||
        (o.client || '').toLowerCase().includes(term) ||
        (o.gst || '').toLowerCase().includes(term) ||
        (o.poNo || '').toLowerCase().includes(term) ||
        (o.customerName || '').toLowerCase().includes(term)
      )
    }

    // Apply column filters
    Object.entries(columnFilters).forEach(([key, selectedValues]) => {
      if (selectedValues && selectedValues.length > 0) {
        result = result.filter(o => {
          const val = String(o[key] || '').trim() || '(Empty)'
          return selectedValues.includes(val)
        })
      }
    })

    // Apply color filter
    if (colorFilter.length > 0) {
      result = result.filter(o => colorFilter.includes(o.rowColor))
    }

    setFilteredOrders(result)
    setActivePage(1)
  }, [searchTerm, selectedOrders, orders, columnFilters, colorFilter])

  useEffect(() => {
    localStorage.setItem(`oms_columns_${user.username}`, JSON.stringify(visibleColumns))
  }, [visibleColumns])

  const fetchOrders = async () => {
    try {
      const res = await axios.get('/api/orders')
      setOrders(res.data)
    } catch (err) {
      console.error('Failed to fetch orders', err)
    }
  }

  const fetchDeletedOrders = async () => {
    try {
      const res = await axios.get('/api/orders/deleted/all')
      setDeletedOrders(res.data)
    } catch (err) {
      console.error('Failed to fetch deleted orders', err)
    }
  }

  const fetchAllPayments = async () => {
    try {
      const res = await axios.get('/api/orders/payments/all')
      setAllPayments(res.data)
    } catch (err) {
      console.error('Failed to fetch payments', err)
    }
  }

  const fetchAllReminders = async () => {
    try {
      const res = await axios.get('/api/orders/reminders/all')
      setAllReminders(res.data)
    } catch (err) { console.error(err) }
  }

  const fetchPaperRequests = async () => {
    try {
      const [all, my, users, retAll, retMy] = await Promise.all([
        axios.get('/api/orders/paper-requests/all'),
        axios.get('/api/orders/paper-requests/my'),
        axios.get('/api/users/list'),
        axios.get('/api/orders/return-requests/all'),
        axios.get('/api/orders/return-requests/my')
      ])
      setPaperRequests(all.data)
      setMyPaperRequests(my.data)
      setAllUsers(users.data)
      setReturnRequests(retAll.data)
      setMyReturnRequests(retMy.data)
    } catch (err) { console.error(err) }
  }

  const fetchEditLogs = async (order) => {
    try {
      const res = await axios.get(`/api/orders/${order.id}/edit-logs`)
      setEditHistoryPopup({ order, logs: res.data })
    } catch (err) { console.error(err) }
  }

  const handleSearch = (e) => { setSearchTerm(e.target.value) }

  const handleExport = () => {
    const cols = allowedColumns.filter(c => visibleColumns.includes(c.key))
    const exportData = filteredOrders.map(o => {
      const row = {}
      cols.forEach(col => {
        let val = o[col.key]
        if (col.key === 'date' || col.key === 'deliveryDate') val = formatDate(val)
        else if (['totalAmount', 'receivedAmount', 'balance'].includes(col.key)) val = val || 0
        else if (col.key === 'percentReceived') val = `${val || 0}%`
        else val = val || ''
        row[col.label] = val
      })
      return row
    })

    // Show preview first
    const headers = Object.keys(exportData[0] || {})
    let html = `<html><head><title>Excel Preview - OMS Prestair</title><style>
      body { font-family: Arial, sans-serif; margin: 10px; font-size: 9px; }
      h2 { text-align: center; font-size: 14px; margin-bottom: 4px; }
      .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 3px 5px; text-align: center; font-size: 8px; word-wrap: break-word; }
      th { background: #FFD700; font-weight: bold; font-size: 9px; }
      tr:nth-child(even) { background: #f9f9f9; }
      .no-print { text-align: center; margin: 12px 0; }
      .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
      .dl-btn { background: #27ae60; color: #fff; }
      .cancel-btn { background: #eee; color: #333; }
    </style></head><body>`
    html += `<div class="no-print"><button class="dl-btn" id="dlBtn">Download Excel</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span style="margin-left:16px;font-size:13px;font-weight:600;color:#555">Total Rows: ${exportData.length}</span></div>`
    html += `<h2>OMS - Prestair Systems LLP</h2>`
    html += `<p class="subtitle">Orders Export Preview | ${exportData.length} records | ${new Date().toLocaleDateString('en-IN')}</p>`
    html += `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
    exportData.forEach(row => {
      html += `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`
    })
    html += `</tbody></table></body></html>`
    const previewWin = window.open('', '_blank')
    previewWin.document.write(html)
    previewWin.document.close()
    previewWin.document.getElementById('dlBtn').onclick = () => {
      const ws = XLSX.utils.json_to_sheet(exportData)
      ws['!cols'] = headers.map(key => {
        let maxLen = key.length
        exportData.forEach(row => { const val = String(row[key] || ''); if (val.length > maxLen) maxLen = val.length })
        return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
      })
      const range = XLSX.utils.decode_range(ws['!ref'])
      const centerKeys = ['date','orderNo','photography','siteVideo','review','status','deliveryDate','customerName','gst','followUp','salesRep','deliveryAddress','phoneNo','siteVerification','installationStatus','installationRemarks','lop','sectionDrawing','inProduction','installation','totalAmount','receivedAmount','balance','percentReceived','daysToOrder','akhilSirAudit','advanceBill','orRecvd']
      const centerCols = cols.map((col, idx) => centerKeys.includes(col.key) ? idx : -1).filter(i => i >= 0)
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          if (!ws[addr]) ws[addr] = { v: '', t: 's' }
          if (!ws[addr].s) ws[addr].s = {}
          ws[addr].s.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          if (r === 0) {
            ws[addr].s.font = { bold: true, sz: 11 }
            ws[addr].s.fill = { fgColor: { rgb: 'FFD700' } }
            ws[addr].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
          } else {
            ws[addr].s.alignment = { vertical: 'center', wrapText: true }
            if (centerCols.includes(c)) ws[addr].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
          }
        }
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Orders')
      XLSX.writeFile(wb, `OMS_Orders_${new Date().toISOString().split('T')[0]}.xlsx`)
      previewWin.close()
    }
  }

  const handlePrint = (orientation) => {
    setShowPrintDialog(false)
    const cols = allowedColumns.filter(c => visibleColumns.includes(c.key))
    const colCount = cols.length + 1 // +1 for serial number
    const pageWidth = orientation === 'landscape' ? 297 : 210
    const pageMargin = 8
    const usableWidth = pageWidth - (pageMargin * 2)
    const colWidth = Math.floor(usableWidth / colCount)

    let html = `<html><head><title>OMS Orders - Print</title>
    <style>
      @page { size: A4 ${orientation}; margin: ${pageMargin}mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8px; color: #555; } }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 8px; }
      h2 { text-align: center; font-size: 12px; margin-bottom: 4px; }
      .subtitle { text-align: center; font-size: 9px; color: #555; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #333; padding: 2px 3px; text-align: center; word-wrap: break-word; overflow: hidden; font-size: 7px; }
      th { background: #1a1a2e; color: #fff; font-weight: 700; font-size: 7px; }
      tr:nth-child(even) { background: #f5f5f5; }
      .page-footer { display: none; }
      .no-print { margin: 10px 0; text-align: center; }
      .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
      .print-btn { background: #1a1a2e; color: #fff; }
      .cancel-btn { background: #eee; color: #333; }
      @media print { .no-print { display: none !important; } .page-footer { display: block; position: fixed; bottom: 0; width: 100%; text-align: center; font-size: 8px; color: #555; } }
    </style></head><body>`
    html += `<div class="no-print"><button class="print-btn" onclick="window.print()">Confirm & Print</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span id="pageInfo" style="margin-left:16px;font-size:13px;font-weight:600;color:#555"></span></div>`
    html += `<h2>OMS - Prestair Systems LLP</h2>`
    html += `<p class="subtitle">Orders Report | ${orientation.toUpperCase()} | Date: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })} | Total: ${filteredOrders.length} orders</p>`
    html += `<table><thead><tr><th style="width:${colWidth}mm">#</th>`
    cols.forEach(col => { html += `<th style="width:${colWidth}mm">${col.label}</th>` })
    html += `</tr></thead><tbody>`
    filteredOrders.forEach((o, idx) => {
      html += `<tr><td>${idx + 1}</td>`
      cols.forEach(col => {
        let val = o[col.key]
        if (col.key === 'date' || col.key === 'deliveryDate') val = formatDate(val)
        else if (['totalAmount', 'receivedAmount', 'balance'].includes(col.key)) val = (val || 0).toLocaleString('en-IN')
        else if (col.key === 'percentReceived') val = `${val || 0}%`
        else if (col.key === 'daysToOrder') {
          if (o.date) {
            try {
              let d = null
              if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(o.date)) { const p = o.date.split('/'); d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])) }
              else d = new Date(o.date)
              if (d && !isNaN(d)) { const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0); val = Math.ceil((today - d) / (1000*60*60*24)) }
            } catch {}
          }
        }
        else val = val || ''
        html += `<td>${val}</td>`
      })
      html += `</tr>`
    })
    html += `</tbody></table><script>window.onload=function(){var ph=${orientation === 'landscape' ? 190 : 277};var pages=Math.ceil(document.body.scrollHeight/(ph*3.78));document.getElementById("pageInfo").textContent="Total Pages: "+pages;}</script></body></html>`
    const printWin = window.open('', '_blank')
    printWin.document.write(html)
    printWin.document.close()
  }

  const handleDeletedExport = () => {
    const exportData = deletedOrders.map((o, idx) => ({
      '#': idx + 1,
      'Date': formatDate(o.date),
      'PO No': o.poNo || '',
      'Client': o.client || '',
      'Order No': o.orderNo || '',
      'Customer Name': o.customerName || '',
      'GST': o.gst || '',
      'DOD Status': o.status || '',
      'Sales Rep': o.salesRep || '',
      'Total Amount': o.totalAmount || 0,
      'Received': o.receivedAmount || 0,
      'Balance': (o.totalAmount || 0) - (o.receivedAmount || 0),
      '% Rcv': o.percentReceived || 0,
      'Payment Remarks': o.paymentRemarks || '',
      'Audit Remarks': o.remarks || '',
      'Akhil Sir Audit': o.akhilSirAudit || '',
      'Advance Bill': o.advanceBill || '',
      'OR Recvd': o.orRecvd || '',
      'Deleted By': o.deletedBy || '',
      'Deleted On': o.deletedAt ? formatDate(o.deletedAt.split('T')[0]) : ''
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Completed Orders')
    XLSX.writeFile(wb, `OMS_Completed_Orders_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleDeletedImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      const convertDate = (val) => {
        if (!val) return ''
        if (typeof val === 'number') {
          const d = new Date((val - 25569) * 86400 * 1000)
          return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
        }
        return String(val)
      }
      const orders = data.map(row => ({
        date: convertDate(row['Date'] || row['DATE']),
        poNo: row['PO No'] || row['PO NO'] || '',
        client: row['Client'] || row['CLIENT'] || '',
        orderNo: row['Order No'] || row['ORDER NO'] || '',
        customerName: row['Customer Name'] || row['CUSTOMER NAME'] || '',
        gst: row['GST'] || '',
        status: row['DOD Status'] || row['Status'] || '',
        salesRep: row['Sales Rep'] || row['SALES REP'] || '',
        totalAmount: parseFloat(row['Total Amount'] || 0) || 0,
        receivedAmount: parseFloat(row['Received'] || 0) || 0,
        balance: parseFloat(row['Balance'] || 0) || 0,
        percentReceived: parseFloat(row['% Rcv'] || 0) || 0,
        paymentRemarks: row['Payment Remarks'] || '',
        remarks: row['Audit Remarks'] || row['Remarks'] || '',
        akhilSirAudit: row['Akhil Sir Audit'] || '',
        advanceBill: row['Advance Bill'] || '',
        orRecvd: row['OR Recvd'] || ''
      }))
      try {
        const res = await axios.post('/api/orders/import', { orders, overwrite: false })
        if (res.data.duplicates?.length) {
          alert(`Imported ${res.data.added} orders. ${res.data.duplicates.length} duplicates skipped.`)
        } else {
          alert(`Successfully imported ${res.data.added} orders`)
        }
        fetchOrders()
        fetchDeletedOrders()
      } catch (err) {
        alert('Import failed: ' + (err.response?.data?.error || err.message))
      }
    }
    reader.readAsBinary(file)
    e.target.value = ''
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      const mapped = data.map(row => {
        // Convert Excel date serial number to DD/MM/YYYY
        const convertDate = (val) => {
          if (!val) return ''
          if (typeof val === 'number') {
            const d = new Date((val - 25569) * 86400 * 1000)
            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
          }
          return String(val)
        }
        return {
        date: convertDate(row['DATE'] || row['Date']), poNo: row['PO NO'] || row['PO No'] || '', client: row['CLIENT'] || row['Client'] || '',
        orderNo: row['ORDER NO.'] || row['Order No'] || row['ORDER NO'] || '', status: row['DOD Status'] || row['Status'] || row['BL+REQ'] || '',
        deliveryDate: convertDate(row['Delivery Date'] || row['Delivery Date Remarks']), deliveryRemarks: row['Delivery Date Remarks'] || row['Remarks'] || '',
        customerName: row['CUSTOMER NAME'] || row['Customer Name'] || '',
        gst: row['GST'] || '', billingAddress: row['BILLING ADDRESS'] || row['Billing Address'] || '',
        followUp: row['FOLLOW UP'] || row['Follow Up'] || '',
        salesRep: row['SALES REP'] || row['Sales Rep'] || '', deliveryAddress: row['DELIVERY ADDRESS'] || row['Delivery Address'] || '',
        phoneNo: String(row['PHONE NO'] || row['Phone No'] || ''),
        siteVerification: row['Site Verification'] || '',
        installationStatus: row['INSTALLATION\nSTATUS'] || row['INSTALLATION STATUS'] || '',
        installationRemarks: row['INSTALLATION\nREMARKS'] || row['INSTALLATION REMARKS'] || '',
        lop: row['LOP'] || '',
        sectionDrawing: row['Section Drawing\nSD'] || row['Section Drawing SD'] || '',
        inProduction: row['In Production'] || '',
        totalAmount: parseFloat(row['Total Amount'] || 0) || 0,
        receivedAmount: parseFloat(row['Recvd'] || row['Received'] || 0) || 0,
        balance: parseFloat(row['BALANCE'] || row['Balance'] || 0) || 0,
        percentReceived: parseFloat(row['% Rcv'] || row['% Rec'] || 0) || 0,
        paymentRemarks: row['Payment REMARKS'] || row['Payment Remarks'] || '',
        daysToOrder: parseInt(row['Days to Order'] || 0) || 0,
        remarks: row['Audit Remarks'] || row['GST Remarks'] || row['Remarks : Nikhil Audit Pending = 35 Nikhil Audit Issue = 4 Adv Bill Check Pending = -36 Actual Adv Bill Pending = 0 Photograpgy Pending = 33'] || row['Remarks'] || '',
        akhilSirAudit: row['AKHIL SIR\nAUDIT'] || row['AKHIL SIR AUDIT'] || row['Akhil Sir Audit'] || '',
        advanceBill: row['ADVANCE BILL'] || row['Advance Bill'] || '',
        orRecvd: row['OR RECVD /NOT RECVD'] || row['OR Recvd'] || ''
      }})
      try {
        const res = await axios.post('/api/orders/import', { orders: mapped, overwrite: false })
        if (res.data.duplicates && res.data.duplicates.length > 0) {
          setImportDuplicates(res.data.duplicates)
          setPendingImport(mapped)
        } else {
          alert(`Successfully imported ${res.data.added} orders`)
          fetchOrders()
        }
      } catch (err) {
        alert('Import failed: ' + (err.response?.data?.error || err.message))
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const confirmImportOverwrite = async () => {
    try {
      const res = await axios.post('/api/orders/import', { orders: pendingImport, overwrite: true })
      alert(`Successfully imported/updated ${res.data.added} orders`)
      setImportDuplicates(null)
      setPendingImport(null)
      fetchOrders()
    } catch (err) { alert('Import failed') }
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/orders/${id}`)
      // Immediately remove from local state
      setOrders(prev => prev.filter(o => o.id !== id))
      setDeleteConfirm(null)
      fetchDeletedOrders()
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || 'Permission denied'))
    }
  }

  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(null)

  const handlePermanentDelete = async (id) => {
    try {
      await axios.delete(`/api/orders/deleted/${id}`)
      setPermanentDeleteConfirm(null)
      await fetchDeletedOrders()
    } catch (err) {
      alert('Permanent delete failed: ' + (err.response?.data?.error || 'Admin access required'))
    }
  }

  const handleRestore = async (id) => {
    if (!window.confirm('Restore this order back to active orders?')) return
    try {
      await axios.post(`/api/orders/deleted/${id}/restore`)
      fetchOrders()
      fetchDeletedOrders()
    } catch (err) {
      alert('Restore failed: ' + (err.response?.data?.error || 'Admin access required'))
    }
  }

  const handleOrderSaved = () => { setShowOrderForm(false); setEditingOrder(null); setEditingDeleted(false); fetchOrders(); fetchDeletedOrders() }
  const handlePaymentSaved = () => { setShowPaymentForm(null); fetchOrders() }

  const getDailyFilteredData = () => {
    let filtered = (dailyFilter === 'siteVideo' || dailyFilter === 'review' || dailyFilter === 'photography') ? [...orders, ...deletedOrders] : orders
    if (dailyFilter === 'percentReceived') {
      if (dailyPercentMax !== '') {
        const max = parseFloat(dailyPercentMax)
        filtered = filtered.filter(o => (o.percentReceived || 0) < max)
      }
      if (dailyPercentDateFrom) {
        filtered = filtered.filter(o => {
          if (!o.date) return false
          let orderDate = null
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(o.date)) {
            const p = o.date.split('/')
            orderDate = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
          } else {
            orderDate = new Date(o.date)
          }
          if (!orderDate || isNaN(orderDate)) return false
          const fromDate = new Date(dailyPercentDateFrom)
          return orderDate >= fromDate
        })
      }
      return filtered
    }
    if (dailyFilter && dailyFilterValue.length > 0) {
      filtered = filtered.filter(o => {
        const val = String(o[dailyFilter] || '').trim()
        if (dailyFilterValue.includes('__blank__') && val === '') return true
        return dailyFilterValue.includes(val)
      })
    }
    if (dailyFilter === 'sectionDrawing' && dailyLopFilter.length > 0) {
      filtered = filtered.filter(o => {
        const val = String(o.lop || '').trim()
        if (dailyLopFilter.includes('__blank__') && val === '') return true
        return dailyLopFilter.includes(val)
      })
    }
    if (dailyFilter === 'advanceBill' && dailyLopFilter.length > 0) {
      filtered = filtered.filter(o => {
        const val = String(o.akhilSirAudit || '').trim()
        if (dailyLopFilter.includes('__blank__') && val === '') return true
        return dailyLopFilter.includes(val)
      })
    }
    return filtered
  }

  const handleDailyExport = () => {
    // Handle Payment Update export separately
    if (dailyFilter === 'paymentUpdate') {
      let filtered = allPayments
      const parsePayDate = (d) => { if (!d) return null; if (d.includes('-')) return new Date(d); const parts = d.split('/'); if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0]); return new Date(d) }
      const formatPayDate = (d) => { if (!d) return '-'; if (d.includes('-')) { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` } return d }
      if (paymentDateFrom) { const from = new Date(paymentDateFrom); filtered = filtered.filter(p => { const pd = parsePayDate(p.paymentDate); return pd && pd >= from }) }
      if (paymentDateTo) { const to = new Date(paymentDateTo); to.setHours(23,59,59); filtered = filtered.filter(p => { const pd = parsePayDate(p.paymentDate); return pd && pd <= to }) }
      const exportData = filtered.map((p, idx) => ({
        '#': idx + 1,
        'Payment Date': formatPayDate(p.paymentDate),
        'Client': p.client || '',
        'Order No': p.orderNo || '',
        'Amount': p.amount || 0,
        'Payment Remarks': p.remarks || '-',
        'Total Amount': p.totalAmount || 0,
        'Received': p.receivedAmount || 0,
        'Balance': p.balance || 0
      }))
      const headers = Object.keys(exportData[0] || {})
      let html = `<html><head><title>Excel Preview - Payment Update</title><style>
        body { font-family: Arial, sans-serif; margin: 10px; font-size: 9px; }
        h2 { text-align: center; font-size: 14px; margin-bottom: 4px; }
        .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #333; padding: 3px 5px; text-align: center; font-size: 8px; word-wrap: break-word; }
        th { background: #FFD700; font-weight: bold; font-size: 9px; }
        tr:nth-child(even) { background: #f9f9f9; }
        .no-print { text-align: center; margin: 12px 0; }
        .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
        .dl-btn { background: #27ae60; color: #fff; }
        .cancel-btn { background: #eee; color: #333; }
      </style></head><body>`
      const dateRange = paymentDateFrom || paymentDateTo ? `${paymentDateFrom || '...'} to ${paymentDateTo || '...'}` : 'All'
      html += `<div class="no-print"><button class="dl-btn" id="dlBtn">Download Excel</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span style="margin-left:16px;font-size:13px;font-weight:600;color:#555">Total Rows: ${exportData.length}</span></div>`
      html += `<h2>OMS - Prestair Systems LLP</h2>`
      html += `<p class="subtitle">Payment Update | Date Range: ${dateRange} | ${exportData.length} records | ${new Date().toLocaleDateString('en-IN')}</p>`
      html += `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
      exportData.forEach(row => { html += `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>` })
      html += `</tbody></table></body></html>`
      const previewWin = window.open('', '_blank')
      previewWin.document.write(html)
      previewWin.document.close()
      previewWin.document.getElementById('dlBtn').onclick = () => {
        const ws = XLSX.utils.json_to_sheet(exportData)
        ws['!cols'] = headers.map(key => { let maxLen = key.length; exportData.forEach(row => { const val = String(row[key] || ''); if (val.length > maxLen) maxLen = val.length }); return { wch: Math.min(Math.max(maxLen + 2, 10), 35) } })
        const range = XLSX.utils.decode_range(ws['!ref'])
        for (let r = range.s.r; r <= range.e.r; r++) { for (let c = range.s.c; c <= range.e.c; c++) { const addr = XLSX.utils.encode_cell({ r, c }); if (!ws[addr]) ws[addr] = { v: '', t: 's' }; if (!ws[addr].s) ws[addr].s = {}; ws[addr].s.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; ws[addr].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }; if (r === 0) { ws[addr].s.font = { bold: true, sz: 11 }; ws[addr].s.fill = { fgColor: { rgb: 'FFD700' } } } else { ws[addr].s.font = { sz: 10 } } } }
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Payment Update')
        XLSX.writeFile(wb, `Payment_Update_${new Date().toISOString().split('T')[0]}.xlsx`)
        previewWin.close()
      }
      return
    }

    // Handle OR tab export separately
    if (dailyFilter === 'orRecvd') {
      const getRequestStatus = (orderNo) => {
        const pr = (paperRequests || []).filter(r => r.orderNo === orderNo)
        const rt = (returnRequests || []).find(r => r.orderNo === orderNo)
        const latestIssue = pr.length > 0 ? pr[0] : null
        if (rt && rt.status === 'ACCEPTED') return 'RECEIVED'
        if (rt && rt.status === 'PENDING') return 'RETURN PENDING'
        if (latestIssue) {
          if (latestIssue.status === 'ACCEPTED') return `ISSUED TO ${getFullName(latestIssue.requestedBy || latestIssue.requested_by)}`
          if (latestIssue.status === 'PENDING') return 'PENDING'
          if (latestIssue.status === 'REJECTED') return 'REJECTED'
          if (latestIssue.status === 'ISSUE') return 'ISSUE'
          if ((latestIssue.status || '').startsWith('REROUTED')) return `REROUTED TO ${getFullName((latestIssue.status || '').replace('REROUTED TO ','').trim())}`
          return latestIssue.status || '-'
        }
        return '-'
      }
      let orFiltered = orders
      if (orTabSearch.trim()) { const term = orTabSearch.toLowerCase(); orFiltered = orFiltered.filter(o => (o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term)) }
      if (orTabStatusFilter.length > 0) { orFiltered = orFiltered.filter(o => { const status = getRequestStatus(o.orderNo).toUpperCase(); return orTabStatusFilter.some(f => { if (f === 'ISSUED') return status.startsWith('ISSUED TO'); if (f === 'REROUTED') return status.startsWith('REROUTED'); if (f === 'NO REQUEST') return status === '-'; return status === f || (status === 'RETURN PENDING' && f === 'PENDING') }) }) }
      orFiltered.sort((a, b) => { const getOrd = (orderNo) => { const v = getRequestStatus(orderNo).toUpperCase(); if (v === '-') return 5; if (v === 'ISSUE') return 0; if (v === 'PENDING' || v === 'RETURN PENDING') return 1; if (v.startsWith('ISSUED TO')) return 2; if (v.startsWith('REROUTED')) return 1; if (v === 'RECEIVED') return 3; if (v === 'REJECTED') return 4; return 2 }; return getOrd(a.orderNo) - getOrd(b.orderNo) })
      const exportData = orFiltered.map((o, idx) => {
        const pr = (paperRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED')
        const rt = (returnRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED')
        return { '#': idx + 1, 'Date': formatDate(o.date), 'Order No': o.orderNo || '', 'Client': o.client || '', 'Issue Date': pr && pr.acceptedAt ? formatDate(pr.acceptedAt.split('T')[0]) : pr && pr.createdAt ? formatDate(pr.createdAt.split('T')[0]) : '-', 'Issue To': pr ? getFullName(pr.requestedBy || pr.requested_by) : '-', 'Status': getRequestStatus(o.orderNo), 'Collected By': rt ? getFullName(rt.acceptedBy || rt.accepted_by) : '-', 'Return Date': rt && rt.acceptedAt ? formatDate(rt.acceptedAt.split('T')[0]) : '-' }
      })
      const headers = Object.keys(exportData[0] || {})
      let html = `<html><head><title>Excel Preview - OR Report</title><style>body{font-family:Arial,sans-serif;margin:10px;font-size:9px}h2{text-align:center;font-size:14px;margin-bottom:4px}.subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:3px 5px;text-align:center;font-size:8px;word-wrap:break-word}th{background:#FFD700;font-weight:bold;font-size:9px}tr:nth-child(even){background:#f9f9f9}.no-print{text-align:center;margin:12px 0}.no-print button{padding:10px 24px;font-size:14px;font-weight:700;border:none;border-radius:6px;cursor:pointer;margin:0 8px}.dl-btn{background:#27ae60;color:#fff}.cancel-btn{background:#eee;color:#333}</style></head><body>`
      html += `<div class="no-print"><button class="dl-btn" id="dlBtn">Download Excel</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span style="margin-left:16px;font-size:13px;font-weight:600;color:#555">Total Rows: ${exportData.length}</span></div>`
      html += `<h2>OMS - Prestair Systems LLP</h2>`
      html += `<p class="subtitle">OR Report | ${exportData.length} records | ${new Date().toLocaleDateString('en-IN')}</p>`
      html += `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
      exportData.forEach(row => { html += `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>` })
      html += `</tbody></table></body></html>`
      const previewWin = window.open('', '_blank')
      previewWin.document.write(html)
      previewWin.document.close()
      previewWin.document.getElementById('dlBtn').onclick = () => {
        const ws = XLSX.utils.json_to_sheet(exportData)
        ws['!cols'] = headers.map(key => { let maxLen = key.length; exportData.forEach(row => { const val = String(row[key] || ''); if (val.length > maxLen) maxLen = val.length }); return { wch: Math.min(Math.max(maxLen + 2, 10), 35) } })
        const range = XLSX.utils.decode_range(ws['!ref'])
        for (let r = range.s.r; r <= range.e.r; r++) { for (let c = range.s.c; c <= range.e.c; c++) { const addr = XLSX.utils.encode_cell({ r, c }); if (!ws[addr]) ws[addr] = { v: '', t: 's' }; if (!ws[addr].s) ws[addr].s = {}; ws[addr].s.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; ws[addr].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }; if (r === 0) { ws[addr].s.font = { bold: true, sz: 11 }; ws[addr].s.fill = { fgColor: { rgb: 'FFD700' } } } else { ws[addr].s.font = { sz: 10 } } } }
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'OR Report')
        XLSX.writeFile(wb, `OR_Report_${new Date().toISOString().split('T')[0]}.xlsx`)
        previewWin.close()
      }
      return
    }

    const filtered = getDailyFilteredData()
    const filterLabel = dailyFilter ? ALL_COLUMNS.find(c => c.key === dailyFilter)?.label : ''
    const exportData = filtered.map((o, idx) => {
      const row = { '#': idx + 1, 'Date': formatDate(o.date), 'PO No': o.poNo || '', 'Client': o.client || '', 'Order No': o.orderNo || '', 'GST': o.gst || '', 'Follow Up': o.followUp || '' }
      if (dailyFilter) row[filterLabel] = o[dailyFilter] || ''
      if (dailyFilter === 'siteVerification') row['Site Verification Remarks'] = o.siteVerificationRemarks || ''
      if (dailyFilter === 'installationStatus') row['Installation Remarks'] = o.installationRemarks || ''
      if (dailyFilter === 'sectionDrawing') row['LOP'] = o.lop || ''
      if (dailyFilter === 'sectionDrawing') row['SD Remarks'] = o.sectionDrawingRemarks || ''
      if (dailyFilter === 'akhilSirAudit') row['Audit Remarks'] = o.remarks || ''
      if (dailyFilter === 'percentReceived') { row['Total Amount'] = o.totalAmount || 0; row['Received'] = o.receivedAmount || 0; row['Balance'] = (o.totalAmount || 0) - (o.receivedAmount || 0) }
      if (dailyFilter === 'photography') row['Photography Remarks'] = o.photographyRemarks || ''
      if (dailyFilter === 'siteVideo') row['Site Video Remarks'] = o.siteVideoRemarks || ''
      if (dailyFilter === 'review') row['Review Remarks'] = o.reviewRemarks || ''
      return row
    })

    // Show preview first
    const headers = Object.keys(exportData[0] || {})
    let html = `<html><head><title>Excel Preview - Daily Report</title><style>
      body { font-family: Arial, sans-serif; margin: 10px; font-size: 9px; }
      h2 { text-align: center; font-size: 14px; margin-bottom: 4px; }
      .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 3px 5px; text-align: center; font-size: 8px; word-wrap: break-word; }
      th { background: #FFD700; font-weight: bold; font-size: 9px; }
      tr:nth-child(even) { background: #f9f9f9; }
      .no-print { text-align: center; margin: 12px 0; }
      .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
      .dl-btn { background: #27ae60; color: #fff; }
      .cancel-btn { background: #eee; color: #333; }
    </style></head><body>`
    html += `<div class="no-print"><button class="dl-btn" id="dlBtn">Download Excel</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span style="margin-left:16px;font-size:13px;font-weight:600;color:#555">Total Rows: ${exportData.length}</span></div>`
    html += `<h2>OMS - Prestair Systems LLP</h2>`
    html += `<p class="subtitle">Daily Report - ${filterLabel || 'All'} | ${exportData.length} records | ${new Date().toLocaleDateString('en-IN')}</p>`
    html += `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
    exportData.forEach(row => {
      html += `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`
    })
    html += `</tbody></table></body></html>`
    const previewWin = window.open('', '_blank')
    previewWin.document.write(html)
    previewWin.document.close()
    previewWin.document.getElementById('dlBtn').onclick = () => {
      const ws = XLSX.utils.json_to_sheet(exportData)
      ws['!cols'] = headers.map(key => {
        if (key === '#') return { wch: 4 }
        if (key === 'Date') return { wch: 10 }
        if (key === 'Client') return { wch: 40 }
        if (key === 'Order No') return { wch: 16 }
        if (key === 'GST') return { wch: 18 }
        if (key === 'PO No') return { wch: 12 }
        if (key === 'Follow Up') return { wch: 10 }
        let maxLen = key.length
        exportData.forEach(row => { const val = String(row[key] || ''); if (val.length > maxLen) maxLen = val.length })
        return { wch: Math.min(Math.max(maxLen + 2, 10), 35) }
      })
      ws['!rows'] = [{ hpt: 22 }]
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          if (!ws[addr]) ws[addr] = { v: '', t: 's' }
          if (!ws[addr].s) ws[addr].s = {}
          ws[addr].s.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          ws[addr].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
          if (r === 0) {
            ws[addr].s.font = { bold: true, sz: 11 }
            ws[addr].s.fill = { fgColor: { rgb: 'FFD700' } }
          } else {
            ws[addr].s.font = { sz: 10 }
            if (headers[c] === 'Client') ws[addr].s.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }
          }
        }
      }
      const wb = XLSX.utils.book_new()
      const sheetName = filterLabel ? `Daily Report - ${filterLabel}` : 'Daily Report'
      XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31))
      XLSX.writeFile(wb, `Daily_Report_${filterLabel || 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`, { bookSST: true })
      previewWin.close()
    }
  }

  const [printHtml, setPrintHtml] = useState('')

  const handleDailyPrint = (orientation) => {
    if (!orientation) {
      setShowPrintPreview(true)
      return
    }

    // Handle Payment Update print separately
    if (dailyFilter === 'paymentUpdate') {
      let filtered = allPayments
      const parsePayDate = (d) => {
        if (!d) return null
        if (d.includes('-')) return new Date(d)
        const parts = d.split('/')
        if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0])
        return new Date(d)
      }
      const formatPayDate = (d) => {
        if (!d) return '-'
        if (d.includes('-')) { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
        return d
      }
      if (paymentDateFrom) {
        const from = new Date(paymentDateFrom)
        filtered = filtered.filter(p => { const pd = parsePayDate(p.paymentDate); return pd && pd >= from })
      }
      if (paymentDateTo) {
        const to = new Date(paymentDateTo); to.setHours(23,59,59)
        filtered = filtered.filter(p => { const pd = parsePayDate(p.paymentDate); return pd && pd <= to })
      }
      let html = `<html><head><title>Payment Update - OMS Prestair</title><style>
        @page { size: A4 ${orientation}; margin: 10mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8px; color: #555; } }
        body { font-family: Arial, sans-serif; margin: 0; padding: 5px; }
        h2 { color: #1a1a2e; margin: 0 0 4px; font-size: 14px; }
        .subtitle { color: #555; font-size: 10px; margin: 2px 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: ${orientation === 'portrait' ? '10px' : '11px'}; border: 1px solid #333; table-layout: fixed; }
        th { background: #FFD700; color: #000; padding: 6px 5px; text-align: center; font-weight: bold; border: 1px solid #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        td { padding: 6px 5px; border: 1px solid #999; word-wrap: break-word; overflow: hidden; text-overflow: ellipsis; text-align: center; }
        tr:nth-child(even) { background: #f5f5f5; }
        .footer { margin-top: 8px; font-size: 8px; color: #888; text-align: right; }
        .no-print { margin: 10px 0; text-align: center; }
        .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
        .print-btn { background: #1a1a2e; color: #fff; }
        .cancel-btn { background: #eee; color: #333; }
        @media print { .no-print { display: none !important; } body { margin: 0; padding: 3mm; } }
      </style></head><body>`
      html += `<div class="no-print"><button class="print-btn" onclick="window.print()">Print</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span id="pageInfo" style="margin-left:16px;font-size:13px;font-weight:600;color:#555"></span></div>`
      html += `<h2>OMS - Prestair Systems LLP</h2>`
      const dateRange = paymentDateFrom || paymentDateTo ? `${paymentDateFrom || '...'} to ${paymentDateTo || '...'}` : 'All'
      html += `<p class="subtitle">Payment Update Report | Date Range: <strong>${dateRange}</strong> | Date: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })} | Layout: ${orientation.toUpperCase()}</p>`
      html += `<table><thead><tr><th style="width:20px">#</th><th>Payment Date</th><th>Client</th><th>Order No</th><th>Amount</th><th>Payment Remarks</th><th>Total Amount</th><th>Received</th><th>Balance</th></tr></thead><tbody>`
      filtered.forEach((p, idx) => {
        html += `<tr><td>${idx + 1}</td><td>${formatPayDate(p.paymentDate)}</td><td>${p.client || ''}</td><td>${p.orderNo || ''}</td><td>${p.amount ? p.amount.toLocaleString() : '0'}</td><td>${p.remarks || '-'}</td><td>${p.totalAmount ? p.totalAmount.toLocaleString() : '0'}</td><td>${p.receivedAmount ? p.receivedAmount.toLocaleString() : '0'}</td><td>${p.balance ? p.balance.toLocaleString() : '0'}</td></tr>`
      })
      html += `</tbody></table><p class="footer">Total: ${filtered.length} payments | Generated: ${new Date().toLocaleString('en-IN')}</p><script>window.onload=function(){var ph=${orientation === 'landscape' ? 190 : 277};var pages=Math.ceil(document.body.scrollHeight/(ph*3.78));document.getElementById("pageInfo").textContent="Total Pages: "+pages;}</script></body></html>`
      const printWindow = window.open('', '_blank')
      printWindow.document.write(html)
      printWindow.document.close()
      setShowPrintPreview(false)
      return
    }

    // Handle OR tab print separately
    if (dailyFilter === 'orRecvd') {
      const getRequestStatus = (orderNo) => {
        const pr = (paperRequests || []).filter(r => r.orderNo === orderNo)
        const rt = (returnRequests || []).find(r => r.orderNo === orderNo)
        const latestIssue = pr.length > 0 ? pr[0] : null
        if (rt && rt.status === 'ACCEPTED') return 'RECEIVED'
        if (rt && rt.status === 'PENDING') return 'RETURN PENDING'
        if (latestIssue) {
          if (latestIssue.status === 'ACCEPTED') return `ISSUED TO ${getFullName(latestIssue.requestedBy || latestIssue.requested_by)}`
          if (latestIssue.status === 'PENDING') return 'PENDING'
          if (latestIssue.status === 'REJECTED') return 'REJECTED'
          if (latestIssue.status === 'ISSUE') return 'ISSUE'
          if ((latestIssue.status || '').startsWith('REROUTED')) return `REROUTED TO ${getFullName((latestIssue.status || '').replace('REROUTED TO ','').trim())}`
          return latestIssue.status || '-'
        }
        return '-'
      }
      let orFiltered = orders
      if (orTabSearch.trim()) { const term = orTabSearch.toLowerCase(); orFiltered = orFiltered.filter(o => (o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term)) }
      if (orTabStatusFilter.length > 0) { orFiltered = orFiltered.filter(o => { const status = getRequestStatus(o.orderNo).toUpperCase(); return orTabStatusFilter.some(f => { if (f === 'ISSUED') return status.startsWith('ISSUED TO'); if (f === 'REROUTED') return status.startsWith('REROUTED'); if (f === 'NO REQUEST') return status === '-'; return status === f || (status === 'RETURN PENDING' && f === 'PENDING') }) }) }
      orFiltered.sort((a, b) => { const getOrd = (orderNo) => { const v = getRequestStatus(orderNo).toUpperCase(); if (v === '-') return 5; if (v === 'ISSUE') return 0; if (v === 'PENDING' || v === 'RETURN PENDING') return 1; if (v.startsWith('ISSUED TO')) return 2; if (v.startsWith('REROUTED')) return 1; if (v === 'RECEIVED') return 3; if (v === 'REJECTED') return 4; return 2 }; return getOrd(a.orderNo) - getOrd(b.orderNo) })
      let html = `<html><head><title>OR Report - OMS Prestair</title><style>
        @page { size: A4 ${orientation}; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 5px; }
        h2 { color: #1a1a2e; margin: 0 0 4px; font-size: 14px; }
        .subtitle { color: #555; font-size: 10px; margin: 2px 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: ${orientation === 'portrait' ? '8px' : '9px'}; border: 1px solid #333; }
        th { background: #FFD700; color: #000; padding: 4px 3px; text-align: center; font-weight: bold; border: 1px solid #333; }
        td { padding: 3px 4px; border: 1px solid #999; text-align: center; }
        tr:nth-child(even) { background: #f5f5f5; }
        .no-print { margin: 10px 0; text-align: center; }
        .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
        .print-btn { background: #1a1a2e; color: #fff; }
        .cancel-btn { background: #eee; color: #333; }
        @media print { .no-print { display: none !important; } }
      </style></head><body>`
      html += `<div class="no-print"><button class="print-btn" onclick="window.print()">Print</button><button class="cancel-btn" onclick="window.close()">Cancel</button></div>`
      html += `<h2>OMS - Prestair Systems LLP</h2>`
      html += `<p class="subtitle">OR Report | ${orFiltered.length} records | ${new Date().toLocaleDateString('en-IN')}</p>`
      html += `<table><thead><tr><th>#</th><th>Date</th><th>Order No</th><th>Client</th><th>Issue Date</th><th>Issue To</th><th>Status</th><th>Collected By</th><th>Return Date</th></tr></thead><tbody>`
      orFiltered.forEach((o, idx) => {
        const pr = (paperRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED')
        const rt = (returnRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED')
        const status = getRequestStatus(o.orderNo)
        html += `<tr><td>${idx+1}</td><td>${formatDate(o.date)}</td><td>${o.orderNo||''}</td><td>${o.client||''}</td><td>${pr&&pr.acceptedAt?formatDate(pr.acceptedAt.split('T')[0]):pr&&pr.createdAt?formatDate(pr.createdAt.split('T')[0]):'-'}</td><td>${pr?getFullName(pr.requestedBy||pr.requested_by):'-'}</td><td>${status}</td><td>${rt?getFullName(rt.acceptedBy||rt.accepted_by):'-'}</td><td>${rt&&rt.acceptedAt?formatDate(rt.acceptedAt.split('T')[0]):'-'}</td></tr>`
      })
      html += `</tbody></table></body></html>`
      const printWindow = window.open('', '_blank')
      printWindow.document.write(html)
      printWindow.document.close()
      setShowPrintPreview(false)
      return
    }

    const filtered = getDailyFilteredData()
    const filterLabel = dailyFilter ? ALL_COLUMNS.find(c => c.key === dailyFilter)?.label : ''
    const selectedValues = dailyFilterValue.length > 0 ? dailyFilterValue.map(v => v === '__blank__' ? '(Blank)' : v).join(', ') : 'All'
    let html = `<html><head><title>Daily Report - OMS Prestair</title><style>
      @page { size: A4 ${orientation}; margin: 10mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8px; color: #555; } }
      body { font-family: Arial, sans-serif; margin: 0; padding: 5px; }
      h2 { color: #1a1a2e; margin: 0 0 4px; font-size: 14px; }
      .subtitle { color: #555; font-size: 10px; margin: 2px 0 8px; }
      table { width: 100%; border-collapse: collapse; font-size: ${orientation === 'portrait' ? '8px' : '9px'}; border: 1px solid #333; table-layout: fixed; }
      th { background: #FFD700; color: #000; padding: 4px 3px; text-align: left; font-weight: bold; border: 1px solid #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      td { padding: 3px 4px; border: 1px solid #999; word-wrap: break-word; overflow: hidden; text-overflow: ellipsis; }
      tr:nth-child(even) { background: #f5f5f5; }
      .footer { margin-top: 8px; font-size: 8px; color: #888; text-align: right; }
      .no-print { margin: 10px 0; text-align: center; }
      .no-print button { padding: 10px 24px; font-size: 14px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; margin: 0 8px; }
      .print-btn { background: #1a1a2e; color: #fff; }
      .cancel-btn { background: #eee; color: #333; }
      @media print { .no-print { display: none !important; } body { margin: 0; padding: 3mm; } }
    </style></head><body>`
    html += `<div class="no-print"><button class="print-btn" onclick="window.print()">Print</button><button class="cancel-btn" onclick="window.close()">Cancel</button><span id="pageInfo" style="margin-left:16px;font-size:13px;font-weight:600;color:#555"></span></div>`
    html += `<h2>OMS - Prestair Systems LLP</h2>`
    html += `<p class="subtitle">Daily Report | Filter: <strong>${filterLabel || 'None'}</strong> | Values: <strong>${selectedValues}</strong> | Date: ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })} | Layout: ${orientation.toUpperCase()}</p>`
    html += `<table><thead><tr><th style="width:20px">#</th><th style="width:55px">Date</th><th>PO No</th><th>Client</th><th style="width:80px">Order No</th><th>GST</th><th style="width:50px">Follow Up</th>`
    if (dailyFilter) html += `<th>${filterLabel}</th>`
    if (dailyFilter === 'siteVerification') html += `<th>SV Remarks</th>`
    if (dailyFilter === 'installationStatus') html += `<th>Inst. Remarks</th>`
    if (dailyFilter === 'sectionDrawing') html += `<th>LOP</th>`
    if (dailyFilter === 'sectionDrawing') html += `<th>SD Remarks</th>`
    if (dailyFilter === 'advanceBill') html += `<th>Akhil Sir Audit</th>`
    if (dailyFilter === 'akhilSirAudit') html += `<th>Audit Remarks</th>`
    if (dailyFilter === 'percentReceived') html += `<th>Total Amount</th><th>Received</th><th>Balance</th>`
    if (dailyFilter === 'photography') html += `<th>Photo Remarks</th>`
    if (dailyFilter === 'siteVideo') html += `<th>Video Remarks</th>`
    if (dailyFilter === 'review') html += `<th>Review Remarks</th>`
    html += `</tr></thead><tbody>`
    filtered.forEach((o, idx) => {
      html += `<tr><td>${idx + 1}</td><td>${formatDate(o.date)}</td><td>${o.poNo || ''}</td><td>${o.client || ''}</td><td>${o.orderNo || ''}</td><td>${o.gst || ''}</td><td>${o.followUp || ''}</td>`
      if (dailyFilter) html += `<td>${o[dailyFilter] || ''}</td>`
      if (dailyFilter === 'siteVerification') html += `<td>${o.siteVerificationRemarks || ''}</td>`
      if (dailyFilter === 'installationStatus') html += `<td>${o.installationRemarks || ''}</td>`
      if (dailyFilter === 'sectionDrawing') html += `<td>${o.lop || ''}</td>`
      if (dailyFilter === 'sectionDrawing') html += `<td>${o.sectionDrawingRemarks || ''}</td>`
      if (dailyFilter === 'advanceBill') html += `<td>${o.akhilSirAudit || ''}</td>`
      if (dailyFilter === 'akhilSirAudit') html += `<td>${o.remarks || ''}</td>`
      if (dailyFilter === 'percentReceived') html += `<td>${(o.totalAmount || 0).toLocaleString('en-IN')}</td><td>${(o.receivedAmount || 0).toLocaleString('en-IN')}</td><td>${((o.totalAmount || 0) - (o.receivedAmount || 0)).toLocaleString('en-IN')}</td>`
      if (dailyFilter === 'photography') html += `<td>${o.photographyRemarks || ''}</td>`
      if (dailyFilter === 'siteVideo') html += `<td>${o.siteVideoRemarks || ''}</td>`
      if (dailyFilter === 'review') html += `<td>${o.reviewRemarks || ''}</td>`
      html += `</tr>`
    })
    html += `</tbody></table><p class="footer">Total: ${filtered.length} orders | Generated: ${new Date().toLocaleString('en-IN')}</p><script>window.onload=function(){var ph=${orientation === 'landscape' ? 190 : 277};var pages=Math.ceil(document.body.scrollHeight/(ph*3.78));document.getElementById("pageInfo").textContent="Total Pages: "+pages;}</script></body></html>`
    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
    setShowPrintPreview(false)
  }

  const toggleColumn = (key) => {
    setVisibleColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const formatCurrency = (val) => {
    if (!val && val !== 0) return ''
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(val)
  }

  const formatDate = (val) => {
    if (!val) return ''
    // Already in DD/MM/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) return val
    try {
      const d = new Date(val)
      if (isNaN(d)) return val
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `${day}/${month}/${year}`
    } catch { return val }
  }

  const getCellValue = (order, key) => {
    const val = order[key]
    if (key === 'paymentRemarks') {
      return <span>{val || ''} {order.paymentProofUrl && <><a href={order.paymentProofUrl} target="_blank" rel="noreferrer" style={{ color: '#2980b9', fontSize: '10px', fontWeight: '700' }} onClick={e => e.stopPropagation()}>View Supporting</a>{isAdmin && <button onClick={async(e)=>{e.stopPropagation();if(window.confirm('Delete this supporting image?')){try{await axios.delete(`/api/delete-payment-proof/${order.id}`);fetchOrders()}catch{}}}} style={{marginLeft:'4px',padding:'1px 5px',background:'#e74c3c',color:'#fff',border:'none',borderRadius:'3px',fontSize:'9px',cursor:'pointer',fontWeight:'600'}}>Delete</button>}</>}</span>
    }
    if (key === 'orderNo') return <span onClick={(e)=>{e.stopPropagation();fetchEditLogs(order)}} style={{cursor:'pointer',color:'#1a1a2e',fontWeight:'600',textDecoration:'underline'}}>{val}</span>
    if (key === 'receivedAmount') return <span onClick={async(e)=>{e.stopPropagation();try{const res=await axios.get(`/api/orders/${order.id}/payments`);setReceiptDrillDown({order,payments:res.data})}catch{}}} style={{cursor:'pointer',color:'#2980b9',textDecoration:'underline',fontWeight:'600'}}>{formatCurrency(val)}</span>
    if (['totalAmount'].includes(key)) return formatCurrency(val)
    if (key === 'balance') return formatCurrency((order.totalAmount || 0) - (order.receivedAmount || 0))
    if (key === 'percentReceived') return `${val || 0}%`
    if (key === 'date' || key === 'deliveryDate') return formatDate(val)
    if (key === 'daysToOrder') {
      // Calculate days since order was placed (current date - order date)
      if (order.date) {
        try {
          let d = null
          const val2 = order.date
          // Try DD/MM/YYYY
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val2)) {
            const p = val2.split('/')
            d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
          } else if (/^\d{4}-\d{2}-\d{2}/.test(val2)) {
            d = new Date(val2)
          } else {
            d = new Date(val2)
          }
          if (d && !isNaN(d)) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            d.setHours(0, 0, 0, 0)
            const diff = Math.ceil((today - d) / (1000 * 60 * 60 * 24))
            return diff
          }
        } catch {}
      }
      return val || ''
    }
    return val || ''
  }

  // Get unique values for a column (for filter dropdown)
  const getUniqueValues = (key) => {
    const values = new Set()
    orders.forEach(o => {
      const val = String(o[key] || '').trim() || '(Empty)'
      values.add(val)
    })
    return [...values].sort()
  }

  const toggleFilterValue = (colKey, value) => {
    setColumnFilters(prev => {
      const current = prev[colKey] || []
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      if (updated.length === 0) {
        const { [colKey]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [colKey]: updated }
    })
  }

  const clearFilter = (colKey) => {
    setColumnFilters(prev => {
      const { [colKey]: _, ...rest } = prev
      return rest
    })
    setOpenFilter(null)
  }

  const displayedColumns = allowedColumns.filter(c => visibleColumns.includes(c.key))

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>OMS Dashboard</h1>
          <span style={styles.headerUser}>Welcome, {user.fullName || user.username} ({user.role})</span>
        </div>
        <div style={styles.headerRight}>
          <button onClick={() => { fetchOrders(); fetchDeletedOrders(); fetchPaperRequests(); const btn = document.getElementById('refreshBtn'); btn.style.opacity='0.3'; setTimeout(()=>btn.style.opacity='1', 300) }} id="refreshBtn" style={{ ...styles.headerBtn, background: '#27ae60', transition: 'opacity 0.3s' }}>Refresh</button>
          {isAdmin && <button onClick={() => navigate('/users')} style={styles.headerBtn}>Manage Users</button>}
          {isAdmin && <button onClick={async () => { if (window.confirm('Send daily report email now?')) { try { const res = await axios.get('/api/cron-daily-report'); alert('Report sent to agm.prestairsystem@gmail.com') } catch(e) { alert('Error: ' + (e.response?.data?.error || e.message)) } } }} style={{ ...styles.headerBtn, background: '#27ae60' }}>Send Report</button>}
          {isAdmin && <button onClick={async () => { if (window.confirm('Force refresh ALL users?')) { await axios.post('/api/force-refresh'); alert('All users will refresh within 30 seconds.') } }} style={{ ...styles.headerBtn, background: '#8e44ad' }}>Force Refresh All</button>}
          {isAdmin && <button onClick={async () => { if (window.confirm('Fix old payment proof URLs? This may take a moment.')) { try { const res = await axios.post('/api/fix-payment-proofs'); alert(`Done! Fixed: ${res.data.fixed}, Failed: ${res.data.failed}, Skipped: ${res.data.skipped}${res.data.errors?.length ? '\n\nErrors:\n' + res.data.errors.join('\n') : ''}`) } catch(e) { alert('Error: ' + (e.response?.data?.error || e.message)) } } }} style={{ ...styles.headerBtn, background: '#16a085' }}>Fix Proof URLs</button>}
          <button onClick={logout} style={{ ...styles.headerBtn, background: '#e74c3c' }}>Logout</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabBar}>
        <button onClick={() => setActiveTab('active')} style={activeTab === 'active' ? styles.tabActive : styles.tab}>Active Orders</button>
        <button onClick={() => setActiveTab('deleted')} style={activeTab === 'deleted' ? styles.tabActive : styles.tab}>Completed / Deleted Orders ({deletedOrders.length})</button>
        <button onClick={() => setActiveTab('reports')} style={activeTab === 'reports' ? styles.tabActive : styles.tab}>Reports</button>
        <button onClick={() => setActiveTab('daily')} style={activeTab === 'daily' ? styles.tabActive : styles.tab}>Daily Reports</button>
        <button onClick={() => setActiveTab('paperIssue')} style={activeTab === 'paperIssue' ? styles.tabActive : styles.tab}>Paper Issue Request</button>
        <button onClick={() => { setActiveTab('reminders'); fetchAllReminders() }} style={activeTab === 'reminders' ? styles.tabActive : styles.tab}>Reminders</button>
      </div>

      {activeTab === 'active' && <>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            {selectedOrders.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {selectedOrders.map(oNo => (
                  <span key={oNo} style={{ background: '#1a1a2e', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {oNo}
                    <button onClick={() => setSelectedOrders(selectedOrders.filter(x => x !== oNo))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '700', padding: 0, lineHeight: 1 }}>x</button>
                  </span>
                ))}
                <button onClick={() => { setSelectedOrders([]); setSearchTerm('') }} style={{ fontSize: '10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '10px', padding: '3px 8px', cursor: 'pointer', fontWeight: '600' }}>Clear All</button>
              </div>
            )}
            <input
              type="text"
              placeholder={selectedOrders.length >= 5 ? 'Max 5 selected' : 'Search by Order No, Client, GST, PO No...'}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setShowSearchDrop(true) }}
              onFocus={() => { if (searchTerm.trim()) setShowSearchDrop(true) }}
              disabled={selectedOrders.length >= 5}
              style={styles.searchInput}
            />
            {showSearchDrop && searchTerm.trim() && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {orders.filter(o => {
                  const term = searchTerm.toLowerCase()
                  return !selectedOrders.includes(o.orderNo) && (
                    (o.orderNo || '').toLowerCase().includes(term) ||
                    (o.client || '').toLowerCase().includes(term) ||
                    (o.gst || '').toLowerCase().includes(term) ||
                    (o.poNo || '').toLowerCase().includes(term) ||
                    (o.customerName || '').toLowerCase().includes(term)
                  )
                }).slice(0, 10).map(o => (
                  <div key={o.id} onClick={() => { setSelectedOrders([...selectedOrders, o.orderNo]); setSearchTerm(''); setShowSearchDrop(false) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background = '#f0f8ff'} onMouseLeave={e => e.target.style.background = '#fff'}>
                    <strong>{o.orderNo}</strong> — {o.client} {o.customerName ? `(${o.customerName})` : ''}
                  </div>
                ))}
                {orders.filter(o => { const term = searchTerm.toLowerCase(); return !selectedOrders.includes(o.orderNo) && ((o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term) || (o.gst || '').toLowerCase().includes(term) || (o.poNo || '').toLowerCase().includes(term) || (o.customerName || '').toLowerCase().includes(term)) }).length === 0 && (
                  <div style={{ padding: '10px', textAlign: 'center', color: '#888', fontSize: '11px' }}>No results</div>
                )}
              </div>
            )}
          </div>
          <div style={{display:'inline-flex',alignItems:'center',gap:'6px',marginLeft:'10px'}}>
            <span style={{fontSize:'11px',fontWeight:'600',color:'#555'}}>Filter:</span>
            {[{c:'red',bg:'#e74c3c',label:'Red'},{c:'orange',bg:'#f39c12',label:'Orange'},{c:'yellow',bg:'#f1c40f',label:'Yellow'}].map(({c,bg,label})=>(
              <label key={c} style={{display:'flex',alignItems:'center',gap:'3px',cursor:'pointer',padding:'3px 8px',borderRadius:'4px',background:colorFilter.includes(c)?bg+'33':'#f0f0f0',border:colorFilter.includes(c)?`2px solid ${bg}`:'2px solid transparent',fontSize:'11px',fontWeight:'600'}}>
                <input type="checkbox" checked={colorFilter.includes(c)} onChange={e=>{if(e.target.checked)setColorFilter([...colorFilter,c]);else setColorFilter(colorFilter.filter(x=>x!==c))}} style={{display:'none'}}/>
                <span style={{width:'12px',height:'12px',borderRadius:'50%',background:bg,display:'inline-block'}}></span>
                {label}
              </label>
            ))}
            {colorFilter.length > 0 && <button onClick={()=>setColorFilter([])} style={{fontSize:'10px',background:'#eee',border:'none',borderRadius:'3px',padding:'3px 6px',cursor:'pointer'}}>Clear</button>}
          </div>
        </div>
        <div style={styles.actions}>
          {canCreateOrder && <button onClick={() => { setEditingOrder(null); setShowOrderForm(true) }} style={styles.actionBtn}>+ Add New Order</button>}
          <button onClick={() => setShowColumnPicker(!showColumnPicker)} style={{ ...styles.actionBtn, background: '#2980b9' }}>Select Columns</button>
          <button onClick={handleExport} style={{ ...styles.actionBtn, background: '#27ae60' }}>Download Excel</button>
          <button onClick={() => setShowPrintDialog(true)} style={{ ...styles.actionBtn, background: '#8e44ad' }}>Print</button>
          {isAdmin && (
            <>
              <button onClick={() => fileInputRef.current.click()} style={{ ...styles.actionBtn, background: '#f39c12' }}>Import Excel</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} />
            </>
          )}
        </div>
      </div>

      {/* Order Status Checker */}
      <div style={{ margin: '0 24px 12px', padding: '10px 16px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a2e' }}>Order Status:</span>
        <input
          type="text"
          placeholder="Enter Order No to check status..."
          value={statusCheckSearch}
          onChange={(e) => {
            const val = e.target.value
            setStatusCheckSearch(val)
            if (val.trim()) {
              const term = val.toLowerCase()
              const results = []
              orders.forEach(o => { if ((o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term)) results.push({ ...o, status_type: 'ACTIVE' }) })
              deletedOrders.forEach(o => { if ((o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term)) results.push({ ...o, status_type: 'COMPLETED' }) })
              setStatusCheckResults(results.slice(0, 10))
            } else {
              setStatusCheckResults([])
            }
          }}
          style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', width: '250px' }}
        />
        {statusCheckResults.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {statusCheckResults.map(o => (
              <span key={o.id + o.status_type} style={{ padding: '5px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '700', background: o.status_type === 'ACTIVE' ? '#d4edda' : '#f8d7da', color: o.status_type === 'ACTIVE' ? '#155724' : '#721c24', border: `1px solid ${o.status_type === 'ACTIVE' ? '#c3e6cb' : '#f5c6cb'}` }}>
                {o.orderNo} — <strong>{o.status_type}</strong>
              </span>
            ))}
          </div>
        )}
        {statusCheckSearch.trim() && statusCheckResults.length === 0 && (
          <span style={{ fontSize: '11px', color: '#888' }}>No order found</span>
        )}
      </div>

      {/* Column Picker */}
      {showColumnPicker && (
        <div style={styles.columnPicker}>
          <div style={styles.columnPickerHeader}>
            <h3 style={{ margin: 0 }}>Select Columns to Display</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => setVisibleColumns(allowedColumns.map(c => c.key))} style={styles.selectAllBtn}>Select All</button>
              <button onClick={() => setVisibleColumns([])} style={styles.deselectAllBtn}>Deselect All</button>
              <button onClick={() => setShowColumnPicker(false)} style={styles.closeBtn}>X</button>
            </div>
          </div>
          <div style={styles.columnGrid}>
            {allowedColumns.map(col => (
              <label key={col.key} style={styles.columnCheckbox}>
                <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {Object.keys(columnFilters).length > 0 && (
        <div style={styles.filterSummary}>
          <span style={{ fontWeight: '600', fontSize: '12px' }}>Active Filters:</span>
          {Object.entries(columnFilters).map(([key, vals]) => (
            <span key={key} style={styles.filterTag}>
              {ALL_COLUMNS.find(c => c.key === key)?.label}: {vals.length} selected
              <button onClick={() => clearFilter(key)} style={styles.filterTagClose}>x</button>
            </span>
          ))}
          <button onClick={() => setColumnFilters({})} style={styles.clearAllBtn}>Clear All</button>
        </div>
      )}

      {/* Orders Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{...styles.th, position:'sticky', left:0, zIndex:20, minWidth:'40px', background:'#1a1a2e'}}>#</th>
              {displayedColumns.map((col, colIdx) => {
                const freezeCols = 4
                const defaultWidths = { date: 65, poNo: 75, client: 220, orderNo: 130, salesRep: 80, totalAmount: 85, balance: 80, percentReceived: 55, daysToOrder: 60 }
                const userW = colWidthsState[col.key]
                const baseW = userW || defaultWidths[col.key] || 120
                const isFrozen = colIdx < freezeCols
                const frozenLeft = (() => { if (!isFrozen) return 0; let left = 40; for (let i = 0; i < colIdx; i++) { left += colWidthsState[displayedColumns[i].key] || defaultWidths[displayedColumns[i].key] || 120 } return left })()
                const thStyle = isFrozen ? {...styles.th, position:'sticky', left: frozenLeft+'px', zIndex:20, width: baseW+'px', minWidth: baseW+'px', background:'#1a1a2e', whiteSpace:'normal'} : {...styles.th, whiteSpace:'normal', width: baseW+'px', minWidth: baseW+'px', ...(['totalAmount','receivedAmount','balance','percentReceived','daysToOrder','siteVerification','installationStatus','inProduction','billing','installation','lop','sectionDrawing','akhilSirAudit','advanceBill','orRecvd','photography','siteVideo','review','status'].includes(col.key)?{textAlign:'center'}:{})}
                return (
                <th key={col.key} style={thStyle}>
                  <div style={{...styles.thContent, position:'relative'}}>
                    <span>{col.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); setOpenFilter(openFilter === col.key ? null : col.key) }} style={{ ...styles.filterBtn, background: columnFilters[col.key] ? '#f39c12' : 'rgba(255,255,255,0.2)' }} title="Filter">▼</button>
                  </div>
                  <div onMouseDown={(e) => handleResizeStart(e, col.key)} style={{ position:'absolute', right:0, top:0, bottom:0, width:'4px', cursor:'col-resize', background:'transparent', zIndex:25 }} onMouseEnter={e=>e.target.style.background='rgba(255,255,255,0.4)'} onMouseLeave={e=>e.target.style.background='transparent'} />
                  {openFilter === col.key && (
                    <div style={styles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div style={styles.filterDropdownHeader}>
                        <span style={{ fontSize: '11px', fontWeight: '600' }}>Filter: {col.label}</span>
                        <button onClick={() => clearFilter(col.key)} style={{ fontSize: '10px', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>Clear</button>
                      </div>
                      <div style={styles.filterOptions}>
                        {getUniqueValues(col.key).map(val => (
                          <label key={val} style={styles.filterOption}>
                            <input type="checkbox" checked={(columnFilters[col.key] || []).includes(val)} onChange={() => toggleFilterValue(col.key, val)} />
                            <span style={{ fontSize: '11px' }}>{val.length > 30 ? val.substring(0, 30) + '...' : val}</span>
                          </label>
                        ))}
                      </div>
                      <button onClick={() => setOpenFilter(null)} style={styles.filterDoneBtn}>Done</button>
                    </div>
                  )}
                </th>
                )
              })}
              <th style={{...styles.th, position:'sticky', right:0, zIndex:20, minWidth:'260px', background:'#1a1a2e'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order, idx) => {
              const rowBg = order.rowColor === 'red' ? '#ffcccc' : order.rowColor === 'orange' ? '#ffe0b2' : order.rowColor === 'yellow' ? '#fff9c4' : (idx % 2 === 0 ? '#f8f9fa' : '#fff')
              return (
              <tr key={order.id} style={{ ...styles.trEven, background: rowBg }}>
                <td style={{...styles.td, position:'sticky', left:0, zIndex:5, background: rowBg, minWidth:'40px'}}>{idx + 1}</td>
                {displayedColumns.map((col, colIdx) => {
                  const freezeCols = 4
                  const defaultWidths = { date: 65, poNo: 75, client: 220, orderNo: 130, salesRep: 80, totalAmount: 85, balance: 80, percentReceived: 55, daysToOrder: 60 }
                  const baseW = colWidthsState[col.key] || defaultWidths[col.key] || 120
                  const isFrozen = colIdx < freezeCols
                  const frozenLeft = (() => { if (!isFrozen) return 0; let left = 40; for (let i = 0; i < colIdx; i++) { left += colWidthsState[displayedColumns[i].key] || defaultWidths[displayedColumns[i].key] || 120 } return left })()
                  const centerCols = ['totalAmount','receivedAmount','balance','percentReceived','daysToOrder','siteVerification','installationStatus','inProduction','billing','installation','lop','sectionDrawing','akhilSirAudit','advanceBill','orRecvd','photography','siteVideo','review','status']
                  const isCenter = centerCols.includes(col.key)
                  return (
                  <td key={col.key} style={isFrozen ? {...styles.td, position:'sticky', left: frozenLeft+'px', zIndex:5, background: rowBg, width: baseW+'px', minWidth: baseW+'px', ...(isCenter?{textAlign:'center'}:{})} : {...styles.td, width: baseW+'px', minWidth: baseW+'px', ...(isCenter?{textAlign:'center'}:{})}}>{getCellValue(order, col.key)}</td>
                  )
                })}
                <td style={{ ...styles.td, whiteSpace: 'nowrap', position:'sticky', right:0, zIndex:5, background: rowBg, minWidth:'260px', boxShadow:'-2px 0 4px rgba(0,0,0,0.06)' }}>
                  {canColor && <span style={{ display:'inline-flex', gap:'2px', marginRight:'4px' }}>
                    <button onClick={async()=>{await axios.put('/api/orders/'+order.id,{rowColor:'red'});fetchOrders()}} style={{width:'14px',height:'14px',background:'#e74c3c',border:order.rowColor==='red'?'2px solid #000':'1px solid #ccc',borderRadius:'50%',cursor:'pointer',padding:0}} title="Red"/>
                    <button onClick={async()=>{await axios.put('/api/orders/'+order.id,{rowColor:'orange'});fetchOrders()}} style={{width:'14px',height:'14px',background:'#f39c12',border:order.rowColor==='orange'?'2px solid #000':'1px solid #ccc',borderRadius:'50%',cursor:'pointer',padding:0}} title="Orange"/>
                    <button onClick={async()=>{await axios.put('/api/orders/'+order.id,{rowColor:'yellow'});fetchOrders()}} style={{width:'14px',height:'14px',background:'#f1c40f',border:order.rowColor==='yellow'?'2px solid #000':'1px solid #ccc',borderRadius:'50%',cursor:'pointer',padding:0}} title="Yellow"/>
                    <button onClick={async()=>{await axios.put('/api/orders/'+order.id,{rowColor:''});fetchOrders()}} style={{width:'14px',height:'14px',background:'#fff',border:order.rowColor===''||!order.rowColor?'2px solid #000':'1px solid #ccc',borderRadius:'50%',cursor:'pointer',padding:0,fontSize:'8px'}} title="Clear">x</button>
                  </span>}
                  {(isAdmin || user.canAssignReminder) && <button onClick={() => setShowReminderForm(order)} style={{ ...styles.tblBtn, background: '#f39c12' }} title="Reminder">Reminder</button>}
                  {canEditOrders && (
                    <button onClick={() => { setEditingOrder(order); setShowOrderForm(true) }} style={styles.tblBtn} title="Edit">Edit</button>
                  )}
                  {canAddReceipt && (
                    <button onClick={() => setShowPaymentForm(order)} style={{ ...styles.tblBtn, background: '#27ae60' }} title="Receipt">Receipt</button>
                  )}
                  {canDeleteOrders && (
                    <button onClick={() => setDeleteConfirm(order)} style={{ ...styles.tblBtn, background: '#e74c3c' }} title="Delete">Del</button>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <p style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No orders found</p>
        )}
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        <span>Total Orders: {filteredOrders.length}</span>
        <span>Total Value: {formatCurrency(filteredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0))}</span>
        <span>Total Received: {formatCurrency(filteredOrders.reduce((s, o) => s + (o.receivedAmount || 0), 0))}</span>
        <span>Total Balance: {formatCurrency(filteredOrders.reduce((s, o) => s + (o.balance || 0), 0))}</span>
      </div>
      </>}

      {/* Deleted Orders Tab */}
      {activeTab === 'deleted' && (
        <div style={{ padding: '0 24px' }}>
          {isAdmin && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', justifyContent: 'flex-end' }}>
              <button onClick={handleDeletedExport} style={{ ...styles.actionBtn, background: '#27ae60' }}>Download Excel</button>
              <button onClick={() => deletedFileInputRef.current.click()} style={{ ...styles.actionBtn, background: '#f39c12' }}>Import Excel</button>
              <input ref={deletedFileInputRef} type="file" accept=".xlsx,.xls" onChange={handleDeletedImport} style={{ display: 'none' }} />
            </div>
          )}
          <div style={{ marginBottom: '12px', position: 'relative', maxWidth: '400px' }}>
            {selectedDeletedOrders.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {selectedDeletedOrders.map(oNo => (
                  <span key={oNo} style={{ background: '#1a1a2e', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {oNo}
                    <button onClick={() => setSelectedDeletedOrders(selectedDeletedOrders.filter(x => x !== oNo))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '700', padding: 0, lineHeight: 1 }}>x</button>
                  </span>
                ))}
                <button onClick={() => { setSelectedDeletedOrders([]); setDeletedSearchTerm('') }} style={{ fontSize: '10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '10px', padding: '3px 8px', cursor: 'pointer', fontWeight: '600' }}>Clear All</button>
              </div>
            )}
            <input
              type="text"
              placeholder={selectedDeletedOrders.length >= 5 ? 'Max 5 selected' : 'Search by Order No, Client, Customer...'}
              value={deletedSearchTerm}
              onChange={(e) => { setDeletedSearchTerm(e.target.value); setShowDeletedSearchDrop(true) }}
              onFocus={() => { if (deletedSearchTerm.trim()) setShowDeletedSearchDrop(true) }}
              disabled={selectedDeletedOrders.length >= 5}
              style={{ ...styles.searchInput, width: '100%' }}
            />
            {showDeletedSearchDrop && deletedSearchTerm.trim() && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {deletedOrders.filter(o => {
                  const term = deletedSearchTerm.toLowerCase()
                  return !selectedDeletedOrders.includes(o.orderNo) && (
                    (o.orderNo || '').toLowerCase().includes(term) ||
                    (o.client || '').toLowerCase().includes(term) ||
                    (o.customerName || '').toLowerCase().includes(term)
                  )
                }).slice(0, 10).map(o => (
                  <div key={o.id} onClick={() => { setSelectedDeletedOrders([...selectedDeletedOrders, o.orderNo]); setDeletedSearchTerm(''); setShowDeletedSearchDrop(false); setDeletedPage(1) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background = '#f0f8ff'} onMouseLeave={e => e.target.style.background = '#fff'}>
                    <strong>{o.orderNo}</strong> — {o.client} {o.customerName ? `(${o.customerName})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{...styles.th, position:'sticky', left:0, zIndex:20, minWidth:'40px', background:'#1a1a2e'}}>#</th>
                  <th style={{...styles.th, position:'sticky', left:'40px', zIndex:20, minWidth:'85px', background:'#1a1a2e'}}>Date</th>
                  <th style={{...styles.th, position:'sticky', left:'125px', zIndex:20, minWidth:'85px', background:'#1a1a2e'}}>PO No</th>
                  <th style={{...styles.th, position:'sticky', left:'210px', zIndex:20, minWidth:'160px', background:'#1a1a2e'}}>Order No</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>GST</th>
                  <th style={styles.th}>Photography</th>
                  <th style={styles.th}>Site Video</th>
                  <th style={styles.th}>Review</th>
                  <th style={styles.th}>Sales Rep</th>
                  <th style={styles.th}>Delivery Address</th>
                  <th style={styles.th}>Phone No</th>
                  <th style={styles.th}>Total Amount</th>
                  <th style={styles.th}>Received</th>
                  <th style={styles.th}>Balance</th>
                  <th style={styles.th}>Deleted By</th>
                  <th style={styles.th}>Deleted On</th>
                  {isAdmin && <th style={{...styles.th, position:'sticky', right:0, zIndex:20, minWidth:'220px', background:'#1a1a2e'}}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let filtered = deletedOrders
                  if (selectedDeletedOrders.length > 0) {
                    filtered = filtered.filter(o => selectedDeletedOrders.includes(o.orderNo))
                  } else if (deletedSearchTerm.trim()) {
                    const term = deletedSearchTerm.toLowerCase()
                    filtered = filtered.filter(o => (o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term) || (o.customerName || '').toLowerCase().includes(term))
                  }
                  return filtered.map((order, idx) => {
                  return (
                  <tr key={order.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={{...styles.td, position:'sticky', left:0, zIndex:5, background: idx % 2 === 0 ? '#f8f9fa' : '#fff', minWidth:'40px'}}>{idx + 1}</td>
                    <td style={{...styles.td, position:'sticky', left:'40px', zIndex:5, background: idx % 2 === 0 ? '#f8f9fa' : '#fff', minWidth:'85px'}}>{formatDate(order.date)}</td>
                    <td style={{...styles.td, position:'sticky', left:'125px', zIndex:5, background: idx % 2 === 0 ? '#f8f9fa' : '#fff', minWidth:'85px'}}>{order.poNo}</td>
                    <td style={{...styles.td, position:'sticky', left:'210px', zIndex:5, background: idx % 2 === 0 ? '#f8f9fa' : '#fff', minWidth:'160px'}}>{order.orderNo}</td>
                    <td style={styles.td}>{order.client}</td>
                    <td style={styles.td}>{order.customerName}</td>
                    <td style={styles.td}>{order.gst}</td>
                    <td style={styles.td}>{order.photography}</td>
                    <td style={styles.td}>{order.siteVideo}</td>
                    <td style={styles.td}>{order.review}</td>
                    <td style={styles.td}>{order.salesRep}</td>
                    <td style={styles.td}>{order.deliveryAddress}</td>
                    <td style={styles.td}>{order.phoneNo}</td>
                    <td style={styles.td}>{formatCurrency(order.totalAmount)}</td>
                    <td style={styles.td}>{formatCurrency(order.receivedAmount)}</td>
                    <td style={styles.td}>{formatCurrency(order.balance)}</td>
                    <td style={styles.td}>{order.deletedBy}</td>
                    <td style={styles.td}>{order.deletedAt ? (() => { const d = new Date(order.deletedAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` })() : ''}</td>
                    {isAdmin && (
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', position:'sticky', right:0, zIndex:5, background: idx % 2 === 0 ? '#f8f9fa' : '#fff' }}>
                        <button onClick={() => { setEditingOrder(order); setEditingDeleted(true); setShowOrderForm(true) }} style={{ ...styles.tblBtn, background: '#2980b9' }}>Edit</button>
                        <button onClick={() => handleRestore(order.id)} style={{ ...styles.tblBtn, background: '#27ae60' }}>Restore</button>
                        <button onClick={() => setPermanentDeleteConfirm(order)} style={{ ...styles.tblBtn, background: '#e74c3c' }}>Permanent Delete</button>
                      </td>
                    )}
                  </tr>
                )})
                })()}
              </tbody>
            </table>
            {deletedOrders.length === 0 && (
              <p style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No deleted/completed orders</p>
            )}
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div style={{ padding: '24px' }}>
          <div style={styles.reportsGrid}>
            <div style={styles.reportCardSmall}>
              <h3 style={styles.reportCardTitle}>Total Orders</h3>
              <p style={styles.reportCardValueSmall}>{orders.length}</p>
            </div>
            <div style={styles.reportCardSmall}>
              <h3 style={styles.reportCardTitle}>Total Value</h3>
              <p style={styles.reportCardValueSmall}>{formatCurrency(orders.reduce((s, o) => s + (o.totalAmount || 0), 0))}</p>
            </div>
            <div style={styles.reportCardSmall}>
              <h3 style={styles.reportCardTitle}>Received</h3>
              <p style={{ ...styles.reportCardValueSmall, color: '#27ae60' }}>{formatCurrency(orders.reduce((s, o) => s + (o.receivedAmount || 0), 0))}</p>
            </div>
            <div style={styles.reportCardSmall}>
              <h3 style={styles.reportCardTitle}>Balance</h3>
              <p style={{ ...styles.reportCardValueSmall, color: '#e74c3c' }}>{formatCurrency(orders.reduce((s, o) => s + (o.balance || 0), 0))}</p>
            </div>
          </div>

          {/* Delivery Due in Next 2 Days & Overdue */}
          <div style={styles.reportSection}>
            <h3 style={styles.reportSectionTitle}>Delivery Schedule</h3>
            {(() => {
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const twoDaysLater = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)
              const parseDelDate = (d) => {
                if (!d || d === 'DELIVERED' || d === 'ASAP' || d === 'N/A' || d === 'NA' || d === 'HOLD' || d === '') return null
                const parts = String(d).split('/')
                if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
                if (parts.length === 2) return new Date(2026, parseInt(parts[1]) - 1, parseInt(parts[0]))
                return null
              }
              const overdueOrders = orders.filter(o => { const d = parseDelDate(o.deliveryDate); return d && d < today })
              const dueOrders = orders.filter(o => { const d = parseDelDate(o.deliveryDate); return d && d >= today && d <= twoDaysLater })
              return (<>
                {dueOrders.length > 0 ? (<><h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#f39c12' }}>Due in Next 2 Days ({dueOrders.length})</h4>
                <div style={{ ...styles.tableWrap, marginBottom: '12px' }}><table style={styles.table}><thead><tr><th style={styles.th}>#</th><th style={styles.th}>Order No</th><th style={styles.th}>Client</th><th style={styles.th}>Customer</th><th style={styles.th}>Delivery Date</th><th style={styles.th}>Sales Rep</th><th style={styles.th}>Phone</th><th style={styles.th}>Delivery Address</th></tr></thead><tbody>
                  {dueOrders.map((o, idx) => (<tr key={o.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}><td style={styles.td}>{idx+1}</td><td style={styles.td}>{o.orderNo}</td><td style={styles.td}>{o.client}</td><td style={styles.td}>{o.customerName}</td><td style={styles.td}>{o.deliveryDate}</td><td style={styles.td}>{o.salesRep}</td><td style={styles.td}>{o.phoneNo}</td><td style={styles.td}>{o.deliveryAddress}</td></tr>))}
                </tbody></table></div></>) : (!overdueOrders.length && <p style={{ color: '#888', fontSize: '13px' }}>No deliveries due in next 2 days</p>)}
                {overdueOrders.length > 0 && (<><h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#e74c3c' }}>Overdue ({overdueOrders.length})</h4>
                <div style={styles.tableWrap}><table style={styles.table}><thead><tr><th style={styles.th}>#</th><th style={styles.th}>Order No</th><th style={styles.th}>Client</th><th style={styles.th}>Delivery Date</th><th style={styles.th}>Days Overdue</th><th style={styles.th}>Sales Rep</th><th style={styles.th}>Phone</th></tr></thead><tbody>
                  {overdueOrders.sort((a,b) => parseDelDate(a.deliveryDate) - parseDelDate(b.deliveryDate)).map((o, idx) => {
                    const days = Math.ceil((today - parseDelDate(o.deliveryDate)) / (1000*60*60*24))
                    return (<tr key={o.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}><td style={styles.td}>{idx+1}</td><td style={styles.td}>{o.orderNo}</td><td style={styles.td}>{o.client}</td><td style={styles.td}>{o.deliveryDate}</td><td style={{...styles.td, color:'#e74c3c', fontWeight:'700'}}>{days} days</td><td style={styles.td}>{o.salesRep}</td><td style={styles.td}>{o.phoneNo}</td></tr>)
                  })}
                </tbody></table></div></>)}
              </>)
            })()}
          </div>

          {/* Sales Rep Wise Summary */}
          <div style={styles.reportSection}>
            <h3 style={styles.reportSectionTitle}>Sales Rep Wise Summary</h3>
            {!selectedRep ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Sales Rep</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Total Value</th>
                    <th style={styles.th}>Received</th>
                    <th style={styles.th}>Balance</th>
                    <th style={styles.th}>% Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const reps = {}
                    orders.forEach(o => {
                      const rep = o.salesRep || 'Unknown'
                      if (!reps[rep]) reps[rep] = { count: 0, total: 0, received: 0, balance: 0 }
                      reps[rep].count++
                      reps[rep].total += (o.totalAmount || 0)
                      reps[rep].received += (o.receivedAmount || 0)
                      reps[rep].balance += (o.balance || 0)
                    })
                    return Object.entries(reps).sort((a, b) => b[1].total - a[1].total).map(([rep, data], idx) => (
                      <tr key={rep} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={{ ...styles.td, color: '#2980b9', cursor: 'pointer', fontWeight: '600' }} onClick={() => setSelectedRep(rep)}>{rep}</td>
                        <td style={styles.td}>{data.count}</td>
                        <td style={styles.td}>{formatCurrency(data.total)}</td>
                        <td style={styles.td}>{formatCurrency(data.received)}</td>
                        <td style={styles.td}>{formatCurrency(data.balance)}</td>
                        <td style={styles.td}>{data.total ? ((data.received / data.total) * 100).toFixed(1) + '%' : '0%'}</td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
            ) : (
            <div>
              <button onClick={() => setSelectedRep(null)} style={{ padding: '6px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', marginBottom: '10px' }}>Back</button>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px' }}>Orders by: {selectedRep}</h4>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>#</th><th style={styles.th}>Date</th><th style={styles.th}>Order No</th><th style={styles.th}>Client</th><th style={styles.th}>Customer</th><th style={styles.th}>Delivery Date</th><th style={styles.th}>Total</th><th style={styles.th}>Received</th><th style={styles.th}>Balance</th><th style={styles.th}>% Rcv</th><th style={styles.th}>Status</th>
                  </tr></thead>
                  <tbody>
                    {orders.filter(o => (o.salesRep || 'Unknown') === selectedRep).map((o, idx) => (
                      <tr key={o.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={styles.td}>{idx + 1}</td>
                        <td style={styles.td}>{formatDate(o.date)}</td>
                        <td style={styles.td}>{o.orderNo}</td>
                        <td style={styles.td}>{o.client}</td>
                        <td style={styles.td}>{o.customerName}</td>
                        <td style={styles.td}>{o.deliveryDate}</td>
                        <td style={styles.td}>{formatCurrency(o.totalAmount)}</td>
                        <td style={styles.td}>{formatCurrency(o.receivedAmount)}</td>
                        <td style={styles.td}>{formatCurrency(o.balance)}</td>
                        <td style={styles.td}>{(o.percentReceived || 0) + '%'}</td>
                        <td style={styles.td}>{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>

          {/* Payment Status Summary */}
          <div style={styles.reportSection}>
            <h3 style={styles.reportSectionTitle}>Payment Collection Status</h3>
            {!selectedPayStatus ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Orders</th>
                    <th style={styles.th}>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const full = orders.filter(o => o.percentReceived >= 100)
                    const partial = orders.filter(o => o.percentReceived > 0 && o.percentReceived < 100)
                    const none = orders.filter(o => !o.percentReceived || o.percentReceived === 0)
                    return [
                      { label: 'Fully Paid (100%)', data: full, color: '#27ae60' },
                      { label: 'Partially Paid', data: partial, color: '#f39c12' },
                      { label: 'No Payment Received', data: none, color: '#e74c3c' }
                    ].map((row, idx) => (
                      <tr key={row.label} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={{ ...styles.td, color: row.color, fontWeight: '600', cursor: 'pointer' }} onClick={() => setSelectedPayStatus(row.label)}>{row.label}</td>
                        <td style={styles.td}>{row.data.length}</td>
                        <td style={styles.td}>{formatCurrency(row.data.reduce((s, o) => s + (o.totalAmount || 0), 0))}</td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
            ) : (
            <div>
              <button onClick={() => setSelectedPayStatus(null)} style={{ padding: '6px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', marginBottom: '10px' }}>Back</button>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px' }}>{selectedPayStatus}</h4>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>#</th><th style={styles.th}>Date</th><th style={styles.th}>Order No</th><th style={styles.th}>Client</th><th style={styles.th}>Customer</th><th style={styles.th}>Sales Rep</th><th style={styles.th}>Total</th><th style={styles.th}>Received</th><th style={styles.th}>Balance</th><th style={styles.th}>% Rcv</th>
                  </tr></thead>
                  <tbody>
                    {(() => {
                      let filtered = []
                      if (selectedPayStatus === 'Fully Paid (100%)') filtered = orders.filter(o => o.percentReceived >= 100)
                      else if (selectedPayStatus === 'Partially Paid') filtered = orders.filter(o => o.percentReceived > 0 && o.percentReceived < 100)
                      else filtered = orders.filter(o => !o.percentReceived || o.percentReceived === 0)
                      return filtered.map((o, idx) => (
                        <tr key={o.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                          <td style={styles.td}>{idx + 1}</td>
                          <td style={styles.td}>{formatDate(o.date)}</td>
                          <td style={styles.td}>{o.orderNo}</td>
                          <td style={styles.td}>{o.client}</td>
                          <td style={styles.td}>{o.customerName}</td>
                          <td style={styles.td}>{o.salesRep}</td>
                          <td style={styles.td}>{formatCurrency(o.totalAmount)}</td>
                          <td style={styles.td}>{formatCurrency(o.receivedAmount)}</td>
                          <td style={styles.td}>{formatCurrency(o.balance)}</td>
                          <td style={styles.td}>{o.percentReceived ? o.percentReceived + '%' : '0%'}</td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>

          {/* Top 10 Highest Value Orders */}
          <div style={styles.reportSection}>
            <h3 style={styles.reportSectionTitle}>Top 10 Highest Value Orders</h3>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Order No</th>
                    <th style={styles.th}>Client</th>
                    <th style={styles.th}>Total Amount</th>
                    <th style={styles.th}>Received</th>
                    <th style={styles.th}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...orders].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0)).slice(0, 10).map((o, idx) => (
                    <tr key={o.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td style={styles.td}>{idx + 1}</td>
                      <td style={styles.td}>{o.orderNo}</td>
                      <td style={styles.td}>{o.client}</td>
                      <td style={styles.td}>{formatCurrency(o.totalAmount)}</td>
                      <td style={styles.td}>{formatCurrency(o.receivedAmount)}</td>
                      <td style={styles.td}>{formatCurrency(o.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Daily Reports Tab */}
      {activeTab === 'daily' && (
        <div style={{ padding: '24px' }}>
          {/* Filter Buttons */}
          <div style={{ background: '#fff', borderRadius: '8px', padding: '6px 10px', marginBottom: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <button onClick={() => { setDailyFilter('siteVerification'); setDailyFilterValue([]) }} style={dailyFilter === 'siteVerification' ? styles.dailyBtnActive : styles.dailyBtn}>Site Verif.</button>
            <button onClick={() => { setDailyFilter('installationStatus'); setDailyFilterValue([]) }} style={dailyFilter === 'installationStatus' ? styles.dailyBtnActive : styles.dailyBtn}>Installation</button>
            <button onClick={() => { setDailyFilter('sectionDrawing'); setDailyFilterValue([]); setDailyLopFilter([]) }} style={dailyFilter === 'sectionDrawing' ? styles.dailyBtnActive : styles.dailyBtn}>Sec. Drawing</button>
            <button onClick={() => { setDailyFilter('inProduction'); setDailyFilterValue([]) }} style={dailyFilter === 'inProduction' ? styles.dailyBtnActive : styles.dailyBtn}>Production</button>
            <button onClick={() => { setDailyFilter('percentReceived'); setDailyFilterValue([]); setDailyPercentMax(''); setDailyPercentDateFrom('') }} style={dailyFilter === 'percentReceived' ? styles.dailyBtnActive : styles.dailyBtn}>% Rec</button>
            <button onClick={() => { setDailyFilter('akhilSirAudit'); setDailyFilterValue([]) }} style={dailyFilter === 'akhilSirAudit' ? styles.dailyBtnActive : styles.dailyBtn}>Audit</button>
            <button onClick={() => { setDailyFilter('advanceBill'); setDailyFilterValue([]); setDailyLopFilter([]) }} style={dailyFilter === 'advanceBill' ? styles.dailyBtnActive : styles.dailyBtn}>Adv Bill</button>
            <button onClick={() => { setDailyFilter('photography'); setDailyFilterValue([]) }} style={dailyFilter === 'photography' ? styles.dailyBtnActive : styles.dailyBtn}>Photo</button>
            <button onClick={() => { setDailyFilter('siteVideo'); setDailyFilterValue([]) }} style={dailyFilter === 'siteVideo' ? styles.dailyBtnActive : styles.dailyBtn}>Video</button>
            <button onClick={() => { setDailyFilter('review'); setDailyFilterValue([]) }} style={dailyFilter === 'review' ? styles.dailyBtnActive : styles.dailyBtn}>Review</button>
            <button onClick={() => { setDailyFilter('orRecvd'); setDailyFilterValue([]); setOrTabSearch(''); setOrTabStatusFilter([]) }} style={dailyFilter === 'orRecvd' ? styles.dailyBtnActive : styles.dailyBtn}>OR</button>
            <button onClick={() => { setDailyFilter('paymentUpdate'); setDailyFilterValue([]); fetchAllPayments() }} style={dailyFilter === 'paymentUpdate' ? styles.dailyBtnActive : styles.dailyBtn}>Payment</button>
            <span style={{ borderLeft: '2px solid #ddd', height: '22px', margin: '0 2px' }}></span>
            <button onClick={() => handleDailyPrint()} style={{ padding: '5px 10px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Print</button>
            <button onClick={() => handleDailyExport()} style={{ padding: '5px 10px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Excel</button>
          </div>

          {/* Filter Value Selection */}
          {dailyFilter && dailyFilter !== 'percentReceived' && dailyFilter !== 'paymentUpdate' && dailyFilter !== 'orRecvd' && (
            <div style={styles.dailyFilterBar}>
              <span style={{ fontSize: '12px', fontWeight: '600' }}>Filter by: {ALL_COLUMNS.find(c => c.key === dailyFilter)?.label}</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => setDailyFilterValue([])} style={dailyFilterValue.length === 0 ? styles.dailyValActive : styles.dailyVal}>All</button>
                <button onClick={() => dailyFilterValue.includes('__blank__') ? setDailyFilterValue(dailyFilterValue.filter(v => v !== '__blank__')) : setDailyFilterValue([...dailyFilterValue, '__blank__'])} style={dailyFilterValue.includes('__blank__') ? styles.dailyValActive : styles.dailyVal}>(Blank)</button>
                {(() => {
                  const sourceData = (dailyFilter === 'siteVideo' || dailyFilter === 'review' || dailyFilter === 'photography') ? [...orders, ...deletedOrders] : orders
                  const values = [...new Set(sourceData.map(o => String(o[dailyFilter] || '').trim()).filter(v => v))]
                  return values.sort().map(v => (
                    <button key={v} onClick={() => dailyFilterValue.includes(v) ? setDailyFilterValue(dailyFilterValue.filter(x => x !== v)) : setDailyFilterValue([...dailyFilterValue, v])} style={dailyFilterValue.includes(v) ? styles.dailyValActive : styles.dailyVal}>{v}</button>
                  ))
                })()}
              </div>
              {dailyFilter === 'sectionDrawing' && <>
                <span style={{ borderLeft: '2px solid #ddd', height: '24px', margin: '0 4px' }}></span>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>LOP:</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => setDailyLopFilter([])} style={dailyLopFilter.length === 0 ? styles.dailyValActive : styles.dailyVal}>All</button>
                  <button onClick={() => dailyLopFilter.includes('__blank__') ? setDailyLopFilter(dailyLopFilter.filter(v => v !== '__blank__')) : setDailyLopFilter([...dailyLopFilter, '__blank__'])} style={dailyLopFilter.includes('__blank__') ? styles.dailyValActive : styles.dailyVal}>(Blank)</button>
                  {(() => {
                    const values = [...new Set(orders.map(o => String(o.lop || '').trim()).filter(v => v))]
                    return values.sort().map(v => (
                      <button key={v} onClick={() => dailyLopFilter.includes(v) ? setDailyLopFilter(dailyLopFilter.filter(x => x !== v)) : setDailyLopFilter([...dailyLopFilter, v])} style={dailyLopFilter.includes(v) ? styles.dailyValActive : styles.dailyVal}>{v}</button>
                    ))
                  })()}
                </div>
              </>}
              {dailyFilter === 'advanceBill' && <>
                <span style={{ borderLeft: '2px solid #ddd', height: '24px', margin: '0 4px' }}></span>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>Akhil Sir Audit:</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => setDailyLopFilter([])} style={dailyLopFilter.length === 0 ? styles.dailyValActive : styles.dailyVal}>All</button>
                  <button onClick={() => dailyLopFilter.includes('__blank__') ? setDailyLopFilter(dailyLopFilter.filter(v => v !== '__blank__')) : setDailyLopFilter([...dailyLopFilter, '__blank__'])} style={dailyLopFilter.includes('__blank__') ? styles.dailyValActive : styles.dailyVal}>(Blank)</button>
                  {(() => {
                    const values = [...new Set(orders.map(o => String(o.akhilSirAudit || '').trim()).filter(v => v))]
                    return values.sort().map(v => (
                      <button key={v} onClick={() => dailyLopFilter.includes(v) ? setDailyLopFilter(dailyLopFilter.filter(x => x !== v)) : setDailyLopFilter([...dailyLopFilter, v])} style={dailyLopFilter.includes(v) ? styles.dailyValActive : styles.dailyVal}>{v}</button>
                    ))
                  })()}
                </div>
              </>}
            </div>
          )}

          {/* Percent Received Filter */}
          {dailyFilter === 'percentReceived' && (
            <div style={styles.dailyFilterBar}>
              <span style={{ fontSize: '12px', fontWeight: '600' }}>Show orders with % Received less than:</span>
              <input
                type="number"
                value={dailyPercentMax}
                onChange={e => setDailyPercentMax(e.target.value)}
                placeholder="Enter value (e.g. 50)"
                style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '180px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: '600', marginLeft: '16px' }}>Order date from:</span>
              <input
                type="date"
                value={dailyPercentDateFrom}
                onChange={e => setDailyPercentDateFrom(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '160px' }}
              />
              {dailyPercentDateFrom && <button onClick={() => setDailyPercentDateFrom('')} style={{ padding: '6px 10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>Show All</button>}
              <span style={{ fontSize: '11px', color: '#888' }}>{dailyPercentMax ? `Showing orders < ${dailyPercentMax}%` : 'Enter a value to filter'}</span>
            </div>
          )}

          {/* Results Table */}
          {dailyFilter === 'paymentUpdate' ? (
          <div style={styles.tableWrap}>
            <div style={{ marginBottom:'12px', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <span style={{fontSize:'12px',fontWeight:'600'}}>From:</span>
              <input type="date" value={paymentDateFrom} onChange={e=>setPaymentDateFrom(e.target.value)} style={{padding:'6px 10px',border:'1px solid #ddd',borderRadius:'5px',fontSize:'12px'}}/>
              <span style={{fontSize:'12px',fontWeight:'600'}}>To:</span>
              <input type="date" value={paymentDateTo} onChange={e=>setPaymentDateTo(e.target.value)} style={{padding:'6px 10px',border:'1px solid #ddd',borderRadius:'5px',fontSize:'12px'}}/>
              {(paymentDateFrom || paymentDateTo) && <button onClick={()=>{setPaymentDateFrom('');setPaymentDateTo('')}} style={{fontSize:'10px',background:'#eee',border:'none',borderRadius:'3px',padding:'4px 8px',cursor:'pointer'}}>Clear</button>}
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Payment Date</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Order No</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Payment Remarks</th>
                  <th style={styles.th}>Total Amount</th>
                  <th style={styles.th}>Received</th>
                  <th style={styles.th}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let filtered = allPayments
                  const parsePayDate = (d) => {
                    if (!d) return null
                    if (d.includes('-')) return new Date(d)
                    const parts = d.split('/')
                    if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0])
                    return new Date(d)
                  }
                  const formatPayDate = (d) => {
                    if (!d) return '-'
                    if (d.includes('-')) { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
                    return d
                  }
                  if (paymentDateFrom) {
                    const from = new Date(paymentDateFrom)
                    filtered = filtered.filter(p => { const pd = parsePayDate(p.paymentDate); return pd && pd >= from })
                  }
                  if (paymentDateTo) {
                    const to = new Date(paymentDateTo); to.setHours(23,59,59)
                    filtered = filtered.filter(p => { const pd = parsePayDate(p.paymentDate); return pd && pd <= to })
                  }
                  return filtered.map((p, idx) => (
                    <tr key={p.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td style={styles.td}>{idx + 1}</td>
                      <td style={styles.td}>{formatPayDate(p.paymentDate)}</td>
                      <td style={styles.td}>{p.client}</td>
                      <td style={styles.td}>{p.orderNo}</td>
                      <td style={styles.td}>{p.amount ? p.amount.toLocaleString() : '0'}</td>
                      <td style={styles.td}>{p.remarks || '-'}</td>
                      <td style={styles.td}>{p.totalAmount ? p.totalAmount.toLocaleString() : '0'}</td>
                      <td style={styles.td}><span onClick={async()=>{try{const res=await axios.get(`/api/orders/${p.orderId||0}/payments`);setReceiptDrillDown({order:{id:p.orderId,orderNo:p.orderNo,client:p.client},payments:res.data})}catch{}}} style={{cursor:'pointer',color:'#2980b9',textDecoration:'underline',fontWeight:'600'}}>{p.receivedAmount ? p.receivedAmount.toLocaleString() : '0'}</span></td>
                      <td style={styles.td}>{p.balance ? p.balance.toLocaleString() : '0'}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
            {allPayments.length === 0 && <p style={{textAlign:'center',padding:'20px',color:'#888'}}>No payment data</p>}
          </div>
          ) : dailyFilter === 'orRecvd' ? (
          <div style={styles.tableWrap}>
            {/* OR Tab Filter & Search */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px', padding: '8px 12px', background: '#f8f9fa', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600' }}>Status:</span>
              <button onClick={() => setOrTabStatusFilter([])} style={orTabStatusFilter.length === 0 ? styles.dailyValActive : styles.dailyVal}>All</button>
              {['PENDING', 'ISSUED', 'RECEIVED', 'REROUTED', 'REJECTED', 'ISSUE', 'NO REQUEST'].map(s => (
                <button key={s} onClick={() => orTabStatusFilter.includes(s) ? setOrTabStatusFilter(orTabStatusFilter.filter(x => x !== s)) : setOrTabStatusFilter([...orTabStatusFilter, s])} style={orTabStatusFilter.includes(s) ? styles.dailyValActive : styles.dailyVal}>{s}</button>
              ))}
              <span style={{ borderLeft: '2px solid #ddd', height: '22px', margin: '0 4px' }}></span>
              <input value={orTabSearch} onChange={e => setOrTabSearch(e.target.value)} placeholder="Search Order No..." style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '11px', width: '180px' }} />
              {orTabSearch && <button onClick={() => setOrTabSearch('')} style={{ fontSize: '10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>Clear</button>}
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>S.No</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Order No</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Issue Date</th>
                  <th style={styles.th}>Issue To</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Collected By</th>
                  <th style={styles.th}>Return Date</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let filtered = orders
                  // Build status from paper requests
                  const getRequestStatus = (orderNo) => {
                    const pr = (paperRequests || []).filter(r => r.orderNo === orderNo)
                    const rt = (returnRequests || []).find(r => r.orderNo === orderNo)
                    const latestIssue = pr.length > 0 ? pr[0] : null
                    if (rt && rt.status === 'ACCEPTED') return 'RECEIVED'
                    if (rt && rt.status === 'PENDING') return 'RETURN PENDING'
                    if (latestIssue) {
                      if (latestIssue.status === 'ACCEPTED') return `ISSUED TO ${getFullName(latestIssue.requestedBy || latestIssue.requested_by)}`
                      if (latestIssue.status === 'PENDING') return 'PENDING'
                      if (latestIssue.status === 'REJECTED') return 'REJECTED'
                      if (latestIssue.status === 'ISSUE') return 'ISSUE'
                      if ((latestIssue.status || '').startsWith('REROUTED')) return `REROUTED TO ${getFullName((latestIssue.status || '').replace('REROUTED TO ','').trim())}`
                      return latestIssue.status || '-'
                    }
                    return '-'
                  }
                  // Apply search filter
                  if (orTabSearch.trim()) {
                    const term = orTabSearch.toLowerCase()
                    filtered = filtered.filter(o => (o.orderNo || '').toLowerCase().includes(term) || (o.client || '').toLowerCase().includes(term))
                  }
                  // Apply status filter
                  if (orTabStatusFilter.length > 0) {
                    filtered = filtered.filter(o => {
                      const status = getRequestStatus(o.orderNo).toUpperCase()
                      return orTabStatusFilter.some(f => {
                        if (f === 'ISSUED') return status.startsWith('ISSUED TO')
                        if (f === 'REROUTED') return status.startsWith('REROUTED')
                        if (f === 'NO REQUEST') return status === '-'
                        return status === f || status === 'RETURN PENDING' && f === 'PENDING'
                      })
                    })
                  }
                  // Sort: ISSUE first, then PENDING, then ISSUED TO (alphabetically), then RECEIVED
                  filtered = filtered.sort((a, b) => {
                    const getOrder = (orderNo) => {
                      const v = getRequestStatus(orderNo).toUpperCase()
                      if (v === '-' || v === '') return 5
                      if (v === 'ISSUE') return 0
                      if (v === 'PENDING' || v === 'RETURN PENDING') return 1
                      if (v.startsWith('ISSUED TO')) return 2
                      if (v.startsWith('REROUTED')) return 1
                      if (v === 'RECEIVED') return 3
                      if (v === 'REJECTED') return 4
                      return 2
                    }
                    const aOrder = getOrder(a.orderNo)
                    const bOrder = getOrder(b.orderNo)
                    if (aOrder !== bOrder) return aOrder - bOrder
                    if (aOrder === 2) return getRequestStatus(a.orderNo).localeCompare(getRequestStatus(b.orderNo))
                    return 0
                  })
                  return filtered.map((o, idx) => {
                    const status = getRequestStatus(o.orderNo)
                    const statusColor = status === 'RECEIVED' ? '#27ae60' : status.startsWith('ISSUED TO') ? '#8e44ad' : status === 'PENDING' || status === 'RETURN PENDING' ? '#f39c12' : status === 'ISSUE' ? '#e74c3c' : status === 'REJECTED' ? '#e74c3c' : '#888'
                    return (
                    <tr key={o.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td style={styles.td}>{idx + 1}</td>
                      <td style={styles.td}>{formatDate(o.date)}</td>
                      <td style={styles.td}>{o.orderNo}</td>
                      <td style={styles.td}>{o.client}</td>
                      <td style={styles.td}>{(() => { const pr = (paperRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED'); return pr && pr.acceptedAt ? formatDate(pr.acceptedAt.split('T')[0]) : pr && pr.createdAt ? formatDate(pr.createdAt.split('T')[0]) : '-' })()}</td>
                      <td style={styles.td}>{(() => { const pr = (paperRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED'); return pr ? getFullName(pr.requestedBy || pr.requested_by) : '-' })()}</td>
                      <td style={{ ...styles.td, fontWeight: '600', color: statusColor }}>{status}</td>
                      <td style={styles.td}>{(() => { const rt = (returnRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED'); return rt ? getFullName(rt.acceptedBy || rt.accepted_by) : '-' })()}</td>
                      <td style={styles.td}>{(() => { const rt = (returnRequests || []).find(r => r.orderNo === o.orderNo && r.status === 'ACCEPTED'); return rt && rt.acceptedAt ? formatDate(rt.acceptedAt.split('T')[0]) : '-' })()}</td>
                    </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
          ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>PO No</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Order No</th>
                  <th style={styles.th}>GST</th>
                  <th style={styles.th}>Follow Up</th>
                  {dailyFilter && <th style={styles.th}>{ALL_COLUMNS.find(c => c.key === dailyFilter)?.label}</th>}
                  {dailyFilter === 'siteVerification' && <th style={styles.th}>Site Verification Remarks</th>}
                  {dailyFilter === 'installationStatus' && <th style={styles.th}>Installation Remarks</th>}
                  {dailyFilter === 'sectionDrawing' && <th style={styles.th}>LOP</th>}
                  {dailyFilter === 'sectionDrawing' && <th style={styles.th}>SD Remarks</th>}
                  {dailyFilter === 'advanceBill' && <th style={styles.th}>Akhil Sir Audit</th>}
                  {dailyFilter === 'akhilSirAudit' && <th style={styles.th}>Audit Remarks</th>}
                  {dailyFilter === 'percentReceived' && <th style={styles.th}>Total Amount</th>}
                  {dailyFilter === 'percentReceived' && <th style={styles.th}>Received</th>}
                  {dailyFilter === 'percentReceived' && <th style={styles.th}>Balance</th>}
                  {dailyFilter === 'photography' && <th style={styles.th}>Photography Remarks</th>}
                  {dailyFilter === 'siteVideo' && <th style={styles.th}>Site Video Remarks</th>}
                  {dailyFilter === 'review' && <th style={styles.th}>Review Remarks</th>}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = getDailyFilteredData()
                  const deletedIds = new Set(deletedOrders.map(d => d.id))
                  return filtered.map((o, idx) => {
                    const isFromDeleted = deletedIds.has(o.id) || (o.deletedBy !== undefined)
                    const rowStyle = isFromDeleted ? { background: '#ffcccc', color: '#000000' } : (idx % 2 === 0 ? styles.trEven : styles.trOdd)
                    return (
                    <tr key={`${o.id}-${idx}`} style={rowStyle}>
                      <td style={styles.td}>{idx + 1}</td>
                      <td style={styles.td}>{formatDate(o.date)}</td>
                      <td style={styles.td}>{o.poNo}</td>
                      <td style={styles.td}>{o.client}</td>
                      <td style={styles.td}>{o.orderNo}</td>
                      <td style={styles.td}>{o.gst}</td>
                      <td style={styles.td}>{o.followUp}</td>
                      {dailyFilter && <td style={styles.td}>{o[dailyFilter]}</td>}
                      {dailyFilter === 'siteVerification' && <td style={styles.td}>{o.siteVerificationRemarks}</td>}
                      {dailyFilter === 'installationStatus' && <td style={styles.td}>{o.installationRemarks}</td>}
                      {dailyFilter === 'sectionDrawing' && <td style={styles.td}>{o.lop}</td>}
                      {dailyFilter === 'sectionDrawing' && <td style={styles.td}>{o.sectionDrawingRemarks}</td>}
                      {dailyFilter === 'advanceBill' && <td style={styles.td}>{o.akhilSirAudit}</td>}
                      {dailyFilter === 'akhilSirAudit' && <td style={styles.td}>{o.remarks}</td>}
                      {dailyFilter === 'percentReceived' && <td style={styles.td}>{formatCurrency(o.totalAmount)}</td>}
                      {dailyFilter === 'percentReceived' && <td style={styles.td}>{formatCurrency(o.receivedAmount)}</td>}
                      {dailyFilter === 'percentReceived' && <td style={styles.td}>{formatCurrency((o.totalAmount || 0) - (o.receivedAmount || 0))}</td>}
                      {dailyFilter === 'photography' && <td style={styles.td}>{o.photographyRemarks}</td>}
                      {dailyFilter === 'siteVideo' && <td style={styles.td}>{o.siteVideoRemarks}</td>}
                      {dailyFilter === 'review' && <td style={styles.td}>{o.reviewRemarks}</td>}
                    </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Paper Issue Request Tab */}
      {activeTab === 'paperIssue' && (
        <div style={{ padding: '16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', marginBottom: '12px' }}>
            <div style={{ ...styles.reportSection, marginBottom: 0, padding: '12px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700' }}>Request Order Paper</h4>
              {rerouteId ? (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <input value={(() => { const r = (paperRequests || []).find(x => x.id === rerouteId); return r ? r.orderNo : '' })()} disabled style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px', width: '120px', background: '#f0f0f0' }} />
                  <div style={{ flex: '1', position: 'relative' }}>
                    <input value={rerouteSearch} onChange={e => { setRerouteSearch(e.target.value); setShowRerouteDrop(true); setRerouteTo('') }} onFocus={() => setShowRerouteDrop(true)} placeholder="Reroute To..." style={{ padding: '6px', border: '2px solid #8e44ad', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
                    {rerouteTo && <span style={{ fontSize: '9px', color: '#27ae60' }}>{rerouteTo}</span>}
                    {showRerouteDrop && rerouteSearch && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '120px', overflow: 'auto', zIndex: 50, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                        {allUsers.filter(u => u.username !== user.username && ((u.fullName || '').toLowerCase().includes(rerouteSearch.toLowerCase()) || u.username.toLowerCase().includes(rerouteSearch.toLowerCase()))).map(u => (
                          <div key={u.id} onClick={() => { setRerouteTo(u.username); setRerouteSearch(u.fullName || u.username); setShowRerouteDrop(false) }} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '10px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background='#f0f8ff'} onMouseLeave={e => e.target.style.background='#fff'}>{u.fullName || u.username} ({u.username})</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={async () => { if (!rerouteTo) { alert('Select user'); return } await axios.post(`/api/orders/paper-requests/${rerouteId}/reroute`, { rerouteTo }); setRerouteId(null); setRerouteTo(''); setRerouteSearch(''); fetchPaperRequests(); alert('Rerouted!') }} style={{ padding: '6px 10px', background: '#8e44ad', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Send</button>
                  <button onClick={() => { setRerouteId(null); setRerouteTo(''); setRerouteSearch('') }} style={{ padding: '6px 10px', background: '#eee', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>X</button>
                </div>
              ) : (<>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', position: 'relative', minWidth: '130px' }}>
                  {paperOrderNo.length > 0 && <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '3px' }}>{paperOrderNo.map(on => <span key={on} style={{ padding: '1px 4px', background: '#e8f5e9', borderRadius: '2px', fontSize: '9px' }}>{on}<button onClick={() => setPaperOrderNo(paperOrderNo.filter(x => x !== on))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', color: '#e74c3c', marginLeft: '2px' }}>x</button></span>)}</div>}
                  <input value={paperOrderSearch} onChange={e => { setPaperOrderSearch(e.target.value); setShowOrderDropdown(true); setPaperIssueError('') }} onFocus={() => setShowOrderDropdown(true)} onBlur={() => setTimeout(() => setShowOrderDropdown(false), 150)} placeholder="Order No..." style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} disabled={paperOrderNo.length >= 5} />
                  {showOrderDropdown && paperOrderSearch && paperOrderNo.length < 5 && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '120px', overflow: 'auto', zIndex: 50, boxShadow: '0 2px 6px rgba(0,0,0,0.1)', minWidth: '300px' }}>{orders.filter(o => !paperOrderNo.includes(o.orderNo) && ((o.orderNo || '').toLowerCase().includes(paperOrderSearch.toLowerCase()) || (o.client || '').toLowerCase().includes(paperOrderSearch.toLowerCase()))).slice(0, 8).map(o => (<div key={o.id} onClick={() => { setPaperOrderNo([...paperOrderNo, o.orderNo]); setPaperOrderSearch(''); setShowOrderDropdown(false) }} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '10px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background='#f0f8ff'} onMouseLeave={e => e.target.style.background='#fff'}>{o.orderNo} - {o.client || ''}</div>))}</div>)}
                </div>
                <div style={{ flex: '1', position: 'relative', minWidth: '100px' }}>
                  <input value={paperUserSearch} onChange={e => { setPaperUserSearch(e.target.value); setShowUserDropdown(true); setPaperIssueTo(''); setPaperIssueError('') }} onFocus={() => setShowUserDropdown(true)} onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)} placeholder="Request To..." style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
                  {paperIssueTo && <span style={{ fontSize: '9px', color: '#27ae60' }}>{getFullName(paperIssueTo)}</span>}
                  {showUserDropdown && paperUserSearch && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '120px', overflow: 'auto', zIndex: 50, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>{allUsers.filter(u => u.username !== user.username && ((u.fullName || '').toLowerCase().includes(paperUserSearch.toLowerCase()) || u.username.toLowerCase().includes(paperUserSearch.toLowerCase()))).map(u => (<div key={u.id} onClick={() => { setPaperIssueTo(u.username); setPaperUserSearch(u.fullName || u.username); setShowUserDropdown(false) }} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '10px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background='#f0f8ff'} onMouseLeave={e => e.target.style.background='#fff'}>{u.fullName || u.username}</div>))}</div>)}
                </div>
                <button onClick={async () => { if (!paperOrderNo.length || !paperIssueTo) { setPaperIssueError(!paperOrderNo.length ? 'Select Order No' : 'Select User'); return } setPaperIssueError(''); const errors = []; const success = []; for (const on of paperOrderNo) { try { await axios.post('/api/orders/paper-requests', { orderNo: on, issueTo: paperIssueTo }); success.push(on) } catch (err) { errors.push(err.response?.data?.error || `${on}: Failed`) } } if (success.length > 0) { setPaperOrderNo(prev => prev.filter(o => !success.includes(o))); setPaperIssueTo(''); setPaperOrderSearch(''); setPaperUserSearch(''); fetchPaperRequests() } if (errors.length > 0) { setPaperIssueError(errors.join(' | ')) } else { setPaperOrderNo([]); setPaperIssueError('') } }} style={{ padding: '6px 10px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Issue</button>
              </div>
              {paperIssueError && <div style={{ marginTop: '4px', padding: '4px 8px', background: '#fdecea', border: '1px solid #e74c3c', borderRadius: '4px', fontSize: '10px', color: '#e74c3c', fontWeight: '600' }}>{paperIssueError}</div>}
            </>)}
            </div>
            <div style={{ ...styles.reportSection, marginBottom: 0, padding: '12px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700' }}>Return Order Paper</h4>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', position: 'relative', minWidth: '130px' }}>
                  {returnOrderNo.length > 0 && <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '3px' }}>{returnOrderNo.map(on => <span key={on} style={{ padding: '1px 4px', background: '#e8f5e9', borderRadius: '2px', fontSize: '9px' }}>{on}<button onClick={() => setReturnOrderNo(returnOrderNo.filter(x => x !== on))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', color: '#e74c3c', marginLeft: '2px' }}>x</button></span>)}</div>}
                  <input value={returnOrderSearch} onChange={e => { setReturnOrderSearch(e.target.value); setShowReturnOrderDrop(true) }} onFocus={() => setShowReturnOrderDrop(true)} placeholder="Order No..." style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} disabled={returnOrderNo.length >= 5} />
                  {showReturnOrderDrop && returnOrderSearch && returnOrderNo.length < 5 && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '120px', overflow: 'auto', zIndex: 50, boxShadow: '0 2px 6px rgba(0,0,0,0.1)', minWidth: '300px' }}>{orders.filter(o => !returnOrderNo.includes(o.orderNo) && ((o.orderNo || '').toLowerCase().includes(returnOrderSearch.toLowerCase()) || (o.client || '').toLowerCase().includes(returnOrderSearch.toLowerCase()))).slice(0, 8).map(o => (<div key={o.id} onClick={() => { setReturnOrderNo([...returnOrderNo, o.orderNo]); setReturnOrderSearch(''); setShowReturnOrderDrop(false) }} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '10px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background='#f0f8ff'} onMouseLeave={e => e.target.style.background='#fff'}>{o.orderNo} - {o.client || ''}</div>))}</div>)}
                </div>
                <div style={{ flex: '1', position: 'relative', minWidth: '100px' }}>
                  <input value={returnUserSearch} onChange={e => { setReturnUserSearch(e.target.value); setShowReturnUserDrop(true); setReturnIssueTo('') }} onFocus={() => setShowReturnUserDrop(true)} placeholder="Return To..." style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
                  {returnIssueTo && <span style={{ fontSize: '9px', color: '#27ae60' }}>{getFullName(returnIssueTo)}</span>}
                  {showReturnUserDrop && returnUserSearch && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '120px', overflow: 'auto', zIndex: 50, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>{allUsers.filter(u => u.username !== user.username && ((u.fullName || '').toLowerCase().includes(returnUserSearch.toLowerCase()) || u.username.toLowerCase().includes(returnUserSearch.toLowerCase()))).map(u => (<div key={u.id} onClick={() => { setReturnIssueTo(u.username); setReturnUserSearch(u.fullName || u.username); setShowReturnUserDrop(false) }} style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '10px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background='#f0f8ff'} onMouseLeave={e => e.target.style.background='#fff'}>{u.fullName || u.username}</div>))}</div>)}
                </div>
                <button onClick={async () => { if (!returnOrderNo.length || !returnIssueTo) { alert('Select Order & User'); return } try { for (const on of returnOrderNo) { await axios.post('/api/orders/return-requests', { orderNo: on, returnTo: returnIssueTo }) } setReturnOrderNo([]); setReturnIssueTo(''); setReturnOrderSearch(''); setReturnUserSearch(''); fetchPaperRequests(); alert('Return submitted!') } catch (err) { alert(err.response?.data?.error || 'Failed') } }} style={{ padding: '6px 10px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Return</button>
              </div>
            </div>
            <div style={{ ...styles.reportSection, marginBottom: 0, padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700' }}>Search Order</h4>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input value={paperRequestSearch} onChange={e => setPaperRequestSearch(e.target.value)} placeholder="Order No / Client..." style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
                {paperRequestSearch && <button onClick={() => setPaperRequestSearch('')} style={{ fontSize: '10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Clear</button>}
              </div>
            </div>
          </div>
          {(myPaperRequests.length > 0 || myReturnRequests.length > 0) && (<div style={{ display: 'grid', gridTemplateColumns: myPaperRequests.length > 0 && myReturnRequests.length > 0 ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '12px' }}>
            {myPaperRequests.length > 0 && (<div style={{ ...styles.reportSection, marginBottom: 0, padding: '10px', border: '2px solid #f39c12' }}><h4 style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '700', color: '#f39c12' }}>Issue Requests ({myPaperRequests.length})</h4><table style={{ ...styles.table, fontSize: '10px' }}><thead><tr><th style={styles.th}>Order</th><th style={styles.th}>By</th><th style={styles.th}>Action</th></tr></thead><tbody>{myPaperRequests.map(r => (<tr key={r.id}><td style={styles.td}>{r.orderNo}</td><td style={styles.td}>{getFullName(r.requestedBy)}</td><td style={{...styles.td,whiteSpace:'nowrap'}}><button onClick={async()=>{await axios.post(`/api/orders/paper-requests/${r.id}/accept`);fetchPaperRequests();fetchOrders();alert('Accepted!')}} style={{...styles.tblBtn,background:'#27ae60'}}>Accept</button><button onClick={()=>{setRejectModal({id:r.id,type:'paper',orderNo:r.orderNo});setRejectReason('')}} style={{...styles.tblBtn,background:'#e74c3c'}}>Reject</button><button onClick={()=>{setRerouteId(r.id);setRerouteTo('')}} style={{...styles.tblBtn,background:'#8e44ad'}}>Reroute</button></td></tr>))}</tbody></table></div>)}
            {myReturnRequests.length > 0 && (<div style={{ ...styles.reportSection, marginBottom: 0, padding: '10px', border: '2px solid #27ae60' }}><h4 style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '700', color: '#27ae60' }}>Return Requests ({myReturnRequests.length})</h4><table style={{ ...styles.table, fontSize: '10px' }}><thead><tr><th style={styles.th}>Order</th><th style={styles.th}>By</th><th style={styles.th}>Action</th></tr></thead><tbody>{myReturnRequests.map(r => (<tr key={r.id}><td style={styles.td}>{r.orderNo}</td><td style={styles.td}>{r.requestedBy}</td><td style={{...styles.td,whiteSpace:'nowrap'}}><button onClick={async()=>{await axios.post(`/api/orders/return-requests/${r.id}/accept`);fetchPaperRequests();fetchOrders();alert('Returned!')}} style={{...styles.tblBtn,background:'#27ae60'}}>Accept</button><button onClick={()=>{setRejectModal({id:r.id,type:'return',orderNo:r.orderNo});setRejectReason('')}} style={{...styles.tblBtn,background:'#e74c3c'}}>Reject</button></td></tr>))}</tbody></table></div>)}
          </div>)}
          <div style={{ ...styles.reportSection, padding: '10px' }}><h4 style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '700' }}>All Requests</h4><div style={styles.tableWrap}><table style={{ ...styles.table, fontSize: '10px' }}><thead><tr><th style={styles.th}>#</th><th style={styles.th}>Order No</th><th style={styles.th}>Client</th><th style={styles.th}>Issue Date</th><th style={styles.th}>Requested By</th><th style={styles.th}>Issued By</th><th style={styles.th}>Status</th><th style={styles.th}>Return Date</th><th style={styles.th}>Return By</th><th style={styles.th}>Return To</th><th style={styles.th}>Rejection Remark</th><th style={styles.th}>Action</th></tr></thead><tbody>{paperRequests.filter(r => !paperRequestSearch.trim() || (r.orderNo || '').toLowerCase().includes(paperRequestSearch.toLowerCase()) || (r.client || '').toLowerCase().includes(paperRequestSearch.toLowerCase())).map((r, idx) => { const ret = returnRequests.find(rt => rt.orderNo === r.orderNo); return (<tr key={r.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}><td style={styles.td}>{idx + 1}</td><td style={styles.td}>{r.orderNo}</td><td style={styles.td}>{r.client}</td><td style={styles.td}>{r.createdAt ? formatDate(r.createdAt.split('T')[0]) : ''}</td><td style={styles.td}>{getFullName(r.requestedBy)}</td><td style={styles.td}>{getFullName(r.issueTo)}</td><td style={{ ...styles.td, fontWeight: '600', color: r.status === 'PENDING' ? '#f39c12' : r.status === 'ACCEPTED' ? '#27ae60' : r.status === 'ISSUE' ? '#e74c3c' : (r.status||'').startsWith('REROUTED') ? '#8e44ad' : '#e74c3c' }}>{r.status}{ret ? ` / ${ret.status}` : ''}</td><td style={styles.td}>{ret ? (ret.createdAt ? formatDate(ret.createdAt.split('T')[0]) : '') : '-'}</td><td style={styles.td}>{ret ? getFullName(ret.requestedBy) : '-'}</td><td style={styles.td}>{ret ? getFullName(ret.returnTo) : '-'}</td><td style={styles.td}>{(() => { const parts = []; if (r.rejectRemarks) parts.push(<span key='i' style={{color:'#8e44ad'}}>ISSUE (R): {r.rejectRemarks}</span>); if (ret && ret.rejectRemarks) parts.push(<span key='r' style={{color:'#e74c3c'}}>RETURN (R): {ret.rejectRemarks}</span>); return parts.length > 0 ? parts.reduce((a,b) => [a, <br key='br'/>, b]) : '-' })()}</td><td style={{...styles.td,whiteSpace:'nowrap'}}>{r.status==='PENDING'&&(r.requestedBy===user.username||isAdmin)&&<button onClick={()=>{setEditRequestId(r.id);setEditRequestType('issue');setEditRequestUser('');setEditRequestSearch('')}} style={{...styles.tblBtn,background:'#2980b9',fontSize:'9px'}}>Change</button>}{ret&&ret.status==='PENDING'&&(ret.requestedBy===user.username||isAdmin)&&<button onClick={()=>{setEditRequestId(ret.id);setEditRequestType('return');setEditRequestUser('');setEditRequestSearch('')}} style={{...styles.tblBtn,background:'#27ae60',fontSize:'9px'}}>Change Ret</button>}{isAdmin&&<button onClick={async()=>{if(window.confirm(`Delete paper request for ${r.orderNo}?`)){try{await axios.delete(`/api/orders/paper-requests/${r.id}`);fetchPaperRequests();alert('Deleted!')}catch(err){alert(err.response?.data?.error||'Failed')}}}} style={{...styles.tblBtn,background:'#e74c3c',fontSize:'9px'}}>Del</button>}</td></tr>) })}</tbody></table>{paperRequests.length === 0 && <p style={{ textAlign: 'center', padding: '15px', color: '#888', fontSize: '11px' }}>No requests yet</p>}</div></div>

          {/* Edit Request User Modal */}
          {editRequestId && (
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}} onClick={()=>setEditRequestId(null)}>
              <div style={{background:'#fff',borderRadius:'10px',padding:'20px',width:'320px'}} onClick={e=>e.stopPropagation()}>
                <h4 style={{margin:'0 0 12px'}}>Change {editRequestType === 'issue' ? 'Issue To' : 'Return To'}</h4>
                <div style={{position:'relative'}}>
                  <input value={editRequestSearch} onChange={e=>{setEditRequestSearch(e.target.value);setShowEditRequestDrop(true);setEditRequestUser('')}} onFocus={()=>setShowEditRequestDrop(true)} placeholder="Search user by full name..." style={{padding:'8px 10px',border:'1px solid #ddd',borderRadius:'5px',width:'100%',boxSizing:'border-box',fontSize:'12px'}}/>
                  {editRequestUser && <span style={{fontSize:'10px',color:'#27ae60',marginTop:'4px',display:'block'}}>{getFullName(editRequestUser)}</span>}
                  {showEditRequestDrop && editRequestSearch && (<div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #ddd',borderRadius:'4px',maxHeight:'150px',overflow:'auto',zIndex:50,boxShadow:'0 2px 6px rgba(0,0,0,0.1)'}}>{allUsers.filter(u=>u.username!==user.username&&((u.fullName||'').toLowerCase().includes(editRequestSearch.toLowerCase())||u.username.toLowerCase().includes(editRequestSearch.toLowerCase()))).map(u=>(<div key={u.id} onClick={()=>{setEditRequestUser(u.username);setEditRequestSearch(u.fullName||u.username);setShowEditRequestDrop(false)}} style={{padding:'6px 10px',cursor:'pointer',fontSize:'11px',borderBottom:'1px solid #f0f0f0'}} onMouseEnter={e=>e.target.style.background='#f0f8ff'} onMouseLeave={e=>e.target.style.background='#fff'}>{u.fullName||u.username}</div>))}</div>)}
                </div>
                <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'14px'}}>
                  <button onClick={()=>setEditRequestId(null)} style={{padding:'7px 14px',background:'#eee',border:'none',borderRadius:'5px',cursor:'pointer',fontSize:'11px',fontWeight:'600'}}>Cancel</button>
                  <button onClick={async()=>{if(!editRequestUser){alert('Select user');return}try{if(editRequestType==='issue'){await axios.put(`/api/orders/paper-requests/${editRequestId}/change-user`,{issueTo:editRequestUser})}else{await axios.put(`/api/orders/return-requests/${editRequestId}/change-user`,{returnTo:editRequestUser})}setEditRequestId(null);fetchPaperRequests();alert('User changed!')}catch(err){alert(err.response?.data?.error||'Failed')}}} style={{padding:'7px 14px',background:'#1a1a2e',color:'#fff',border:'none',borderRadius:'5px',cursor:'pointer',fontSize:'11px',fontWeight:'600'}}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Edit History Popup */}
      {editHistoryPopup && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}} onClick={()=>setEditHistoryPopup(null)}>
          <div style={{background:'#fff',borderRadius:'10px',padding:'20px',maxWidth:'650px',width:'90%',maxHeight:'80vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
              <h3 style={{margin:0,fontSize:'14px'}}>Edit History: {editHistoryPopup.order.orderNo}</h3>
              <button onClick={()=>setEditHistoryPopup(null)} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',fontWeight:'700'}}>X</button>
            </div>
            <p style={{fontSize:'11px',color:'#555',margin:'0 0 10px'}}>{editHistoryPopup.order.client}</p>
            {editHistoryPopup.logs.length > 0 ? (
              <div style={{fontSize:'11px'}}>
                {editHistoryPopup.logs.map((log, idx) => (
                  <div key={log.id} style={{padding:'8px 10px',marginBottom:'6px',background:idx%2===0?'#f8f9fa':'#fff',borderRadius:'6px',border:'1px solid #eee'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                      <span style={{fontWeight:'600',color:log.edit_type==='RECEIPT_EDIT'?'#8e44ad':'#2980b9'}}>{log.edit_type==='RECEIPT_EDIT'?'Receipt Edit':'Order Edit'}</span>
                      <span style={{color:'#888',fontSize:'10px'}}>{log.created_at?new Date(log.created_at).toLocaleString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):''}</span>
                    </div>
                    <div style={{fontSize:'10px',color:'#555',marginBottom:'3px'}}>By: <strong>{getFullName(log.edited_by)}</strong></div>
                    {(log.changes||[]).map((c,i)=>(
                      <div key={i} style={{fontSize:'10px',marginLeft:'8px'}}>
                        <strong>{c.field}:</strong> <span style={{color:'#e74c3c',textDecoration:'line-through'}}>{c.oldValue||'(empty)'}</span> → <span style={{color:'#27ae60'}}>{c.newValue||'(empty)'}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{textAlign:'center',color:'#888',padding:'20px',fontSize:'12px'}}>No edit history for this order</p>
            )}
          </div>
        </div>
      )}


            {/* Paper Issue Pending Popup */}
      {paperIssuePopup.length > 0 && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#fff', border: '2px solid #f39c12', borderRadius: '10px', padding: '16px', boxShadow: '0 6px 20px rgba(0,0,0,0.2)', zIndex: 3000, maxWidth: '350px', animation: 'pulse 1s infinite' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', color: '#f39c12' }}>Paper Issue Request Pending!</h4>
            <button onClick={() => setPaperIssuePopup([])} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', fontWeight: '700' }}>X</button>
          </div>
          {paperIssuePopup.map(r => (
            <div key={r.id} style={{ padding: '6px 8px', background: '#fff9e6', borderRadius: '4px', marginBottom: '4px', fontSize: '11px' }}>
              <strong>{r.orderNo}</strong> - {r.client}<br/>
              <span style={{ color: '#888' }}>Requested by: {getFullName(r.requestedBy)}</span>
            </div>
          ))}
          <button onClick={() => { setActiveTab('paperIssue'); setPaperIssuePopup([]) }} style={{ marginTop: '8px', padding: '6px 12px', background: '#f39c12', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', width: '100%' }}>Go to Paper Issue Request</button>
        </div>
      )}

      {/* Print Layout Selection Modal */}
      {showPrintPreview && (
        <div style={styles.overlay}>
          <div style={{ ...styles.modal, maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px' }}>Select Print Layout</h3>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 20px' }}>Choose page orientation for A4 paper</p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button onClick={() => handleDailyPrint('portrait')} style={styles.printOptBtn}>
                <div style={{ width: '60px', height: '80px', border: '2px solid #1a1a2e', borderRadius: '4px', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#888' }}>A4</div>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Portrait</span>
              </button>
              <button onClick={() => handleDailyPrint('landscape')} style={styles.printOptBtn}>
                <div style={{ width: '80px', height: '60px', border: '2px solid #1a1a2e', borderRadius: '4px', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#888' }}>A4</div>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Landscape</span>
              </button>
            </div>
            <button onClick={() => setShowPrintPreview(false)} style={{ ...styles.cancelBtn, marginTop: '20px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Reminder Popup - always active, auto-polls for new reminders */}
      <ReminderPopup onClose={() => {}} />

      {/* Print Orientation Dialog */}
      {showPrintDialog && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}} onClick={()=>setShowPrintDialog(false)}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'28px',width:'320px',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:'0 0 16px',fontSize:'16px'}}>Print Orders</h3>
            <p style={{margin:'0 0 20px',fontSize:'12px',color:'#555'}}>Select page orientation:</p>
            <div style={{display:'flex',gap:'12px',justifyContent:'center'}}>
              <button onClick={()=>handlePrint('portrait')} style={{padding:'12px 24px',background:'#1a1a2e',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'700',fontSize:'13px'}}>Portrait</button>
              <button onClick={()=>handlePrint('landscape')} style={{padding:'12px 24px',background:'#2980b9',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'700',fontSize:'13px'}}>Landscape</button>
            </div>
            <button onClick={()=>setShowPrintDialog(false)} style={{marginTop:'16px',padding:'8px 18px',background:'#eee',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:'600'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Reminders Tab */}
      {activeTab === 'reminders' && (
        <div style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>All Reminders</h3>
            <button onClick={fetchAllReminders} style={{ padding: '6px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Refresh</button>
          </div>
          {allReminders.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>No reminders found. Click Refresh to load.</p>
          ) : (
          <div style={{ ...styles.tableWrap, maxHeight: '70vh' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Order No</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Reminder Message</th>
                  <th style={styles.th}>Set By</th>
                  <th style={styles.th}>Assigned To</th>
                  <th style={styles.th}>Response</th>
                  <th style={styles.th}>Responded By</th>
                  <th style={styles.th}>Response Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {allReminders.map((r, idx) => (
                  <tr key={r.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>{idx + 1}</td>
                    <td style={styles.td}>{r.date}</td>
                    <td style={styles.td}>{r.orderNo}</td>
                    <td style={styles.td}>{r.client}</td>
                    <td style={{ ...styles.td, maxWidth: '250px' }}>{r.description}</td>
                    <td style={styles.td}>{getFullName(r.createdBy)}</td>
                    <td style={styles.td}>{r.assignedTo ? getFullName(r.assignedTo) : r.assigned_to ? getFullName(r.assigned_to) : (r.visibleTo || []).map(u => getFullName(u)).join(', ') || '-'}</td>
                    <td style={{ ...styles.td, maxWidth: '300px', color: r.responseText ? '#27ae60' : '#e74c3c', fontWeight: '600', fontSize: '10px' }}>{r.responseText || 'PENDING'}</td>
                    <td style={styles.td}>{r.respondedBy ? getFullName(r.respondedBy) : '-'}</td>
                    <td style={styles.td}>{r.responseDate ? new Date(r.responseDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: r.respondedBy ? '#27ae60' : '#e74c3c' }}>{r.respondedBy ? 'RESPONDED' : 'PENDING'}</td>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => { setReassignId(r.id); setReassignReason('') }} style={{ padding: '3px 8px', background: '#f39c12', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '9px', cursor: 'pointer', fontWeight: '600', marginRight: '4px' }}>Reassign</button>
                      <button onClick={async () => { if (window.confirm('Delete this reminder permanently?')) { await axios.delete(`/api/orders/reminders/${r.id}`); fetchAllReminders() } }} style={{ padding: '3px 8px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '9px', cursor: 'pointer', fontWeight: '600' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Reminder Response Notification */}
      {reminderNotification && (
        <div onClick={() => { setActiveTab('reminders'); fetchAllReminders(); setReminderNotification(null) }} style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#1a1a2e', color: '#fff', padding: '14px 20px', borderRadius: '10px', boxShadow: '0 6px 20px rgba(0,0,0,0.3)', cursor: 'pointer', zIndex: 3000, animation: 'slideIn 0.3s ease', maxWidth: '320px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>New Response Received</div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>From: <strong>{reminderNotification.name}</strong></div>
          <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px' }}>Click to view in Reminders tab</div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}} onClick={()=>setRejectModal(null)}>
          <div style={{background:'#fff',borderRadius:'10px',padding:'24px',width:'380px'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:'0 0 12px',fontSize:'15px'}}>Reject: {rejectModal.orderNo}</h3>
            <p style={{fontSize:'12px',color:'#555',margin:'0 0 12px'}}>Enter reason for rejection:</p>
            <input value={rejectReason} onChange={e=>{setRejectReason(e.target.value);const el=document.getElementById('rejectError');if(el)el.style.display='none'}} placeholder="Rejection reason..." style={{width:'100%',padding:'10px 12px',border:'1px solid #ddd',borderRadius:'6px',fontSize:'13px',boxSizing:'border-box',textTransform:'uppercase',marginBottom:'6px'}} />
            <p id="rejectError" style={{display:'none',color:'#e74c3c',fontSize:'11px',margin:'0 0 10px',fontWeight:'600'}}>Reason is mandatory!</p>
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button onClick={()=>setRejectModal(null)} style={{padding:'8px 16px',background:'#eee',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:'600'}}>Cancel</button>
              <button onClick={async()=>{if(!rejectReason.trim()){setRejectReason('');document.getElementById('rejectError').style.display='block';return}try{if(rejectModal.type==='paper'){await axios.post(`/api/orders/paper-requests/${rejectModal.id}/reject`,{remarks:rejectReason.toUpperCase()})}else{await axios.post(`/api/orders/return-requests/${rejectModal.id}/reject`,{remarks:rejectReason.toUpperCase()})}setRejectModal(null);setRejectReason('');fetchPaperRequests()}catch(e){alert('Error: '+(e.response?.data?.error||e.message))}}} style={{padding:'8px 16px',background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:'700'}}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation */}
      {permanentDeleteConfirm && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}>
          <div style={{background:'#fff',borderRadius:'10px',padding:'24px',width:'380px',textAlign:'center'}}>
            <h3 style={{margin:'0 0 12px',fontSize:'15px',color:'#e74c3c'}}>Permanent Delete</h3>
            <p style={{fontSize:'12px',margin:'0 0 8px'}}>Are you sure you want to PERMANENTLY delete order <strong>{permanentDeleteConfirm.orderNo}</strong>?</p>
            <p style={{fontSize:'11px',color:'#e74c3c',margin:'0 0 16px'}}>This cannot be undone!</p>
            <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
              <button onClick={()=>setPermanentDeleteConfirm(null)} style={{padding:'8px 16px',background:'#eee',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:'600'}}>Cancel</button>
              <button onClick={()=>handlePermanentDelete(permanentDeleteConfirm.id)} style={{padding:'8px 16px',background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:'700'}}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Reminder Modal */}
      {reassignId && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}} onClick={()=>setReassignId(null)}>
          <div style={{background:'#fff',borderRadius:'10px',padding:'24px',width:'380px'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:'0 0 12px',fontSize:'15px'}}>Reassign Reminder</h3>
            <p style={{fontSize:'12px',color:'#555',margin:'0 0 12px'}}>Enter reason / additional query for user (optional):</p>
            <input value={reassignReason} onChange={e=>setReassignReason(e.target.value)} placeholder="Reason for reassign..." style={{width:'100%',padding:'10px 12px',border:'1px solid #ddd',borderRadius:'6px',fontSize:'13px',boxSizing:'border-box',textTransform:'uppercase',marginBottom:'14px'}} />
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button onClick={()=>setReassignId(null)} style={{padding:'8px 16px',background:'#eee',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:'600'}}>Cancel</button>
              <button onClick={async()=>{try{await axios.put(`/api/orders/reminders/${reassignId}/reassign`,{reason:(reassignReason||'').toUpperCase()});setReassignId(null);setReassignReason('');fetchAllReminders()}catch(e){alert('Error: '+(e.response?.data?.error||e.message))}}} style={{padding:'8px 16px',background:'#f39c12',color:'#fff',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer',fontWeight:'700'}}>Reassign</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showOrderForm && (
        <OrderForm
          order={editingOrder}
          onClose={() => { setShowOrderForm(false); setEditingOrder(null); setEditingDeleted(false) }}
          onSaved={handleOrderSaved}
          canEditColumn={canEditColumn}
          isAdmin={isAdmin}
          isDeleted={editingDeleted}
        />
      )}

      {showPaymentForm && (
        <PaymentForm order={showPaymentForm} onClose={() => setShowPaymentForm(null)} onSaved={handlePaymentSaved} />
      )}

      {/* Receipt Drill-Down Popup */}
      {receiptDrillDown && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}} onClick={()=>setReceiptDrillDown(null)}>
          <div style={{background:'#fff',borderRadius:'10px',padding:'20px',maxWidth:'600px',width:'90%',maxHeight:'80vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <h3 style={{margin:0,fontSize:'14px'}}>Payment History: {receiptDrillDown.order.orderNo}</h3>
              <button onClick={()=>setReceiptDrillDown(null)} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',fontWeight:'700'}}>X</button>
            </div>
            <p style={{fontSize:'11px',color:'#555',margin:'0 0 10px'}}>{receiptDrillDown.order.client}</p>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
              <thead><tr style={{background:'#1a1a2e',color:'#fff'}}>
                <th style={{padding:'6px 8px',textAlign:'left'}}>#</th>
                <th style={{padding:'6px 8px',textAlign:'left'}}>Date</th>
                <th style={{padding:'6px 8px',textAlign:'left'}}>Mode</th>
                <th style={{padding:'6px 8px',textAlign:'right'}}>Amount</th>
                <th style={{padding:'6px 8px',textAlign:'left'}}>Remarks</th>
              </tr></thead>
              <tbody>
                {(receiptDrillDown.payments||[]).map((p,i)=>(
                  <tr key={p.id} style={{background:i%2?'#f8f9fa':'#fff',borderBottom:'1px solid #eee'}}>
                    <td style={{padding:'5px 8px'}}>{i+1}</td>
                    <td style={{padding:'5px 8px'}}>{p.date}</td>
                    <td style={{padding:'5px 8px'}}>{p.mode||'-'}</td>
                    <td style={{padding:'5px 8px',textAlign:'right',fontWeight:'600'}}>{p.amount?p.amount.toLocaleString():'0'}</td>
                    <td style={{padding:'5px 8px'}}>{p.remarks||'-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{background:'#e8f5e9',fontWeight:'700'}}>
                <td colSpan={3} style={{padding:'6px 8px'}}>Total Received</td>
                <td style={{padding:'6px 8px',textAlign:'right'}}>{(receiptDrillDown.payments||[]).reduce((s,p)=>s+(p.amount||0),0).toLocaleString()}</td>
                <td></td>
              </tr></tfoot>
            </table>
            {(!receiptDrillDown.payments||receiptDrillDown.payments.length===0)&&<p style={{textAlign:'center',color:'#888',padding:'15px'}}>No receipts found</p>}
          </div>
        </div>
      )}

      {showReminderForm && (
        <ReminderForm
          order={showReminderForm}
          onClose={() => setShowReminderForm(null)}
          onSaved={() => { setShowReminderForm(null) }}
        />
      )}



      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3>Confirm Deletion</h3>
            <p>Are you sure you want to delete order <strong>{deleteConfirm.orderNo}</strong>?</p>
            <p style={{ color: '#e74c3c', fontSize: '13px' }}>This action cannot be undone.</p>
            <div style={styles.modalActions}>
              <button onClick={() => setDeleteConfirm(null)} style={styles.cancelBtn}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} style={styles.dangerBtn}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Duplicates Confirmation */}
      {importDuplicates && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3>Duplicate Orders Found</h3>
            <p>The following order numbers already exist:</p>
            <ul style={{ maxHeight: '200px', overflow: 'auto', fontSize: '13px' }}>
              {importDuplicates.map(d => <li key={d}>{d}</li>)}
            </ul>
            <p>Do you want to overwrite existing data?</p>
            <div style={styles.modalActions}>
              <button onClick={() => { setImportDuplicates(null); setPendingImport(null) }} style={styles.cancelBtn}>Cancel</button>
              <button onClick={confirmImportOverwrite} style={styles.dangerBtn}>Overwrite All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: { minHeight: '100vh', background: '#f0f2f5', overflow: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: '#1a1a2e', color: '#fff' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  headerTitle: { fontSize: '20px', fontWeight: '700', margin: 0 },
  headerUser: { fontSize: '13px', opacity: 0.8 },
  headerRight: { display: 'flex', gap: '8px' },
  headerBtn: { padding: '8px 14px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', flexWrap: 'wrap', gap: '12px' },
  tabBar: { display: 'flex', gap: '0', padding: '16px 24px 0', borderBottom: '2px solid #e0e0e0' },
  tab: { padding: '10px 20px', background: 'none', border: 'none', borderBottom: '2px solid transparent', fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: '#666', marginBottom: '-2px' },
  tabActive: { padding: '10px 20px', background: 'none', border: 'none', borderBottom: '2px solid #1a1a2e', fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: '#1a1a2e', marginBottom: '-2px' },
  searchWrap: { flex: '1', minWidth: '300px', maxWidth: '500px' },
  searchInput: { width: '100%', padding: '12px 16px', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', textTransform: 'uppercase' },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  actionBtn: { padding: '10px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  columnPicker: { margin: '0 24px 16px', padding: '16px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto' },
  columnPickerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', fontWeight: '700' },
  selectAllBtn: { padding: '5px 12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  deselectAllBtn: { padding: '5px 12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  columnGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' },
  columnCheckbox: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' },
  filterSummary: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 24px', flexWrap: 'wrap' },
  filterTag: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#fff3cd', borderRadius: '4px', fontSize: '11px', fontWeight: '500' },
  filterTagClose: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#856404', marginLeft: '2px' },
  clearAllBtn: { padding: '4px 10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  tableWrap: { margin: '0 24px', overflowX: 'auto', overflowY: 'auto', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', maxHeight: '70vh', position: 'relative' },
  table: { borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px', minWidth: '1800px' },
  th: { padding: '10px 8px', background: '#1a1a2e', color: '#fff', fontWeight: '600', textAlign: 'left', whiteSpace: 'normal', position: 'sticky', top: 0, zIndex: 10 },
  thContent: { display: 'flex', alignItems: 'center', gap: '4px' },
  filterBtn: { padding: '2px 5px', border: 'none', borderRadius: '3px', color: '#fff', fontSize: '8px', cursor: 'pointer' },
  filterDropdown: { position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '8px', minWidth: '180px', maxWidth: '250px', zIndex: 100, display: 'flex', flexDirection: 'column' },
  filterDropdownHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #eee' },
  filterOptions: { maxHeight: '220px', minHeight: '60px', overflow: 'auto', flex: '1' },
  filterOption: { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', cursor: 'pointer', color: '#333' },
  filterDoneBtn: { marginTop: '8px', padding: '6px 12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', width: '100%', flexShrink: 0 },
  td: { padding: '8px', borderBottom: '1px solid #eee', borderRight: '1px solid #f0f0f0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' },
  trEven: { background: '#fff' },
  trOdd: { background: '#f8f9fa' },
  tblBtn: { padding: '3px 6px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', marginRight: '3px' },
  summary: { display: 'flex', gap: '24px', padding: '16px 24px', fontSize: '14px', fontWeight: '600', flexWrap: 'wrap' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '12px', padding: '32px', maxWidth: '500px', width: '90%' },
  modalActions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' },
  cancelBtn: { padding: '10px 20px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  dangerBtn: { padding: '10px 20px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  reportsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' },
  reportCard: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', textAlign: 'center' },
  reportCardSmall: { background: '#fff', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', textAlign: 'center' },
  reportCardTitle: { fontSize: '10px', fontWeight: '600', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' },
  reportCardValue: { fontSize: '22px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 4px' },
  reportCardValueSmall: { fontSize: '16px', fontWeight: '700', color: '#1a1a2e', margin: 0 },
  reportCardSub: { fontSize: '11px', color: '#aaa' },
  reportSection: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '20px' },
  reportSectionTitle: { fontSize: '15px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 12px' },
  dailyBtnRow: { display: 'flex', gap: '8px', flexWrap: 'nowrap', marginBottom: '16px', overflowX: 'auto', alignItems: 'center' },
  dailyBtn: { padding: '5px 10px', background: '#fff', color: '#1a1a2e', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  dailyBtnActive: { padding: '5px 10px', background: '#1a1a2e', color: '#fff', border: '1.5px solid #1a1a2e', borderRadius: '6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  dailyFilterBar: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '12px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', flexWrap: 'wrap' },
  dailyVal: { padding: '5px 12px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', fontWeight: '500' },
  dailyValActive: { padding: '5px 12px', background: '#2980b9', color: '#fff', border: '1px solid #2980b9', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' },
  printOptBtn: { padding: '16px 24px', background: '#fff', border: '2px solid #ddd', borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.2s' }
}

export default Dashboard







