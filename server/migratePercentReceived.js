/**
 * One-time migration script: Recalculate percent_received and balance
 * for ALL existing orders based on their total_amount and received_amount.
 *
 * Run with: node server/migratePercentReceived.js
 */
require('dotenv').config()
const { supabase } = require('./db.js')

async function migrate() {
  console.log('Fetching all orders...')
  const { data: orders, error } = await supabase.from('orders').select('id, total_amount, received_amount, balance, percent_received')

  if (error) {
    console.error('Error fetching orders:', error.message)
    process.exit(1)
  }

  console.log(`Found ${orders.length} orders. Recalculating...`)

  let updated = 0
  for (const order of orders) {
    const totalAmt = parseFloat(order.total_amount) || 0
    const receivedAmt = parseFloat(order.received_amount) || 0
    const correctBalance = totalAmt - receivedAmt
    const correctPercent = totalAmt ? parseFloat(((receivedAmt / totalAmt) * 100).toFixed(2)) : 0

    // Only update if values differ
    const currentBalance = parseFloat(order.balance) || 0
    const currentPercent = parseFloat(order.percent_received) || 0

    if (currentBalance !== correctBalance || currentPercent !== correctPercent) {
      const { error: updateErr } = await supabase.from('orders').update({
        balance: correctBalance,
        percent_received: correctPercent
      }).eq('id', order.id)

      if (updateErr) {
        console.error(`  Error updating order ${order.id}:`, updateErr.message)
      } else {
        updated++
        console.log(`  Order ${order.id}: balance ${currentBalance} -> ${correctBalance}, %rec ${currentPercent} -> ${correctPercent}`)
      }
    }
  }

  console.log(`\nDone! Updated ${updated} out of ${orders.length} orders.`)
  process.exit(0)
}

migrate()
