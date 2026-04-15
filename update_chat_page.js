const fs = require('fs');

const path = 'app/chat/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Zap icon to lucide-react imports if not there
if (content.includes('import {') && !content.includes('Zap')) {
  content = content.replace(/import \{([^}]*)Crown([^}]*)\} from "lucide-react"/, 'import {$1Crown, Zap$2} from "lucide-react"');
}

// 2. Add /agents link to bottom navigation
if (!content.includes('/agents')) {
  const replaceStr = `
        <Link href="/agents" onClick={(e) => e.stopPropagation()}
          className="group relative opacity-50 hover:opacity-100 transition-all hover:scale-110 flex items-center justify-center"
          style={{ color: '#a78bfa' }}>
          <Zap className="w-4 h-4 md:w-5 md:h-5" />
          <span className="absolute left-full ml-3 px-2.5 py-1 rounded-md text-[10px] font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>Agents</span>
        </Link>
        <div className="w-[60%] h-[1px] bg-white/10" />
        <Link href="/memory"
`;
  content = content.replace(/<div className="w-\[60%\] h-\[1px\] bg-white\/10" \/>\s*<Link href="\/memory"/, replaceStr.trim());
}

fs.writeFileSync(path, content);
