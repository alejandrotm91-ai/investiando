fetch('http://localhost:3000/api/portfolio/quotes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ holdings: [{ ticker: 'MSFT', shares: 10, avgCost: 300 }] })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data.positions[0], null, 2)))
.catch(console.error);
