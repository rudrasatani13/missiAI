## 2023-10-27 - Icon-only buttons lacking ARIA labels
**Learning:** Found an icon-only button used for dismissing errors that lacked an ARIA label.
**Action:** Replaced the text "×" with `<XCircle size={16} />` from lucide-react and added `aria-label="Dismiss error"` to ensure it is screen reader accessible.
