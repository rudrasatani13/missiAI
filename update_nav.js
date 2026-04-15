const fs = require('fs');

const path = 'app/page.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('href: "/agents"')) {
  content = content.replace(
    /\{ label: "Chat", href: "\/chat" \},/,
    '{ label: "Chat", href: "/chat" },\n              { label: "Agents", href: "/agents" },'
  );
}

fs.writeFileSync(path, content);
