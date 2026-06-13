const XLSX = require('xlsx')
const rows = [
  ['Symbol', 'Shares', 'Price', 'Value'],
  ['VOO', '50', '500', '25000'],
  ['BND', '100', '73', '7300']
]
const ws = XLSX.utils.aoa_to_sheet(rows)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Positions')
XLSX.writeFile(wb, require('path').join(__dirname, 'positions.xlsx'))
console.log('wrote positions.xlsx')
