const fs = require('fs');
const path = 'src/components/WatchlistDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /<div className="overflow-x-auto">/g,
  '<div className="overflow-x-auto pb-32 min-h-[350px]">'
);

fs.writeFileSync(path, content);
console.log("Patched WatchlistDashboard.tsx for scroll");
