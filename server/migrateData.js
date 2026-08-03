import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8'))

async function migrate() {
  console.log('Starting migration...')
  console.log(`Orders: ${data.orders?.length}, Users: ${data.users?.length}, Groups: ${data.groups?.length}`)

  // Migrate users
  for (const u of (data.users || [])) {
    const { error } = await supabase.from('users').upsert({
      username: u.username, password: u.password, full_name: u.fullName || u.full_name || '',
      role: u.role || 'user', user_group: u.group || u.user_group || '',
      column_permissions: u.columnPermissions || u.column_permissions || {},
      can_edit: u.canEdit || u.can_edit || false, can_receipt: u.canReceipt || u.can_receipt || false,
      can_assign_reminder: u.canAssignReminder || u.can_assign_reminder || false,
      can_delete: u.canDelete || u.can_delete || false, can_create_quote: u.canCreateQuote || u.can_create_quote || false
    }, { onConflict: 'username' })
    if (error) console.log(`User ${u.username}: ${error.message}`)
  }
  console.log('Users migrated')

  // Migrate groups
  for (const g of (data.groups || [])) {
    const { error } = await supabase.from('groups').upsert({
      name: g.name, column_permissions: g.columnPermissions || g.column_permissions || {},
      can_edit: g.canEdit || g.can_edit || false, can_receipt: g.canReceipt || g.can_receipt || false,
      can_assign_reminder: g.canAssignReminder || g.can_assign_reminder || false,
      can_delete: g.canDelete || g.can_delete || false, can_create_quote: g.canCreateQuote || g.can_create_quote || false
    }, { onConflict: 'name' })
    if (error) console.log(`Group ${g.name}: ${error.message}`)
  }
  console.log('Groups migrated')

  // Migrate orders in batches
  let orderCount = 0
  for (const o of (data.orders || [])) {
    const row = {
      date: o.date, po_no: o.poNo, client: o.client, order_no: o.orderNo, status: o.status,
      delivery_date: o.deliveryDate, delivery_remarks: o.deliveryRemarks, customer_name: o.customerName,
      gst: o.gst, billing_address: o.billingAddress, follow_up: o.followUp, sales_rep: o.salesRep,
      delivery_address: o.deliveryAddress, phone_no: o.phoneNo, site_verification: o.siteVerification,
      site_verification_remarks: o.siteVerificationRemarks, installation_status: o.installationStatus,
      installation_remarks: o.installationRemarks, lop: o.lop, section_drawing: o.sectionDrawing,
      section_drawing_remarks: o.sectionDrawingRemarks, in_production: o.inProduction,
      billing: o.billing, installation: o.installation, total_amount: o.totalAmount || 0,
      received_amount: o.receivedAmount || 0, balance: o.balance || 0, percent_received: o.percentReceived || 0,
      payment_remarks: o.paymentRemarks, days_to_order: o.daysToOrder || 0, remarks: o.remarks,
      akhil_sir_audit: o.akhilSirAudit, advance_bill: o.advanceBill, or_recvd: o.orRecvd,
      photography: o.photography, photography_remarks: o.photographyRemarks,
      site_video: o.siteVideo, site_video_remarks: o.siteVideoRemarks,
      review: o.review, review_remarks: o.reviewRemarks
    }
    const { error } = await supabase.from('orders').upsert(row, { onConflict: 'order_no' })
    if (error) console.log(`Order ${o.orderNo}: ${error.message}`)
    else orderCount++
  }
  console.log(`Orders migrated: ${orderCount}`)
  console.log('Migration complete!')
}

migrate().catch(console.error)
