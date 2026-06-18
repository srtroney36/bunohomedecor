// Post-build: rebrand the generated Medusa admin (title + favicon).
// Runs after `medusa build` (see package.json "build" script).
// Medusa v2 has no config option for the admin title/favicon, so we patch
// the generated index.html and drop the favicon into the served admin folder.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ADMIN_TITLE = "Buno Admin"

const here = dirname(fileURLToPath(import.meta.url))
const adminDir = join(process.cwd(), ".medusa", "server", "public", "admin")
const indexPath = join(adminDir, "index.html")
const faviconSrc = join(here, "admin-favicon.ico")

if (!existsSync(indexPath)) {
  console.warn(`[brand-admin] ${indexPath} not found — skipping (did 'medusa build' run?)`)
  process.exit(0)
}

// 1) Place the favicon where the admin is served (…/public/admin/favicon.ico → /app/favicon.ico)
if (existsSync(faviconSrc)) {
  copyFileSync(faviconSrc, join(adminDir, "favicon.ico"))
} else {
  console.warn(`[brand-admin] favicon source ${faviconSrc} missing — title only`)
}

let html = readFileSync(indexPath, "utf8")

// 2) Title
if (/<title>[\s\S]*?<\/title>/i.test(html)) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${ADMIN_TITLE}</title>`)
} else {
  html = html.replace(/<head>/i, `<head><title>${ADMIN_TITLE}</title>`)
}

// 3) Favicon — replace any existing icon link(s), else inject before </head>
const faviconTag = `<link rel="icon" type="image/x-icon" href="/app/favicon.ico" />`
if (/<link[^>]*rel=["']icon["'][^>]*>/i.test(html)) {
  html = html.replace(/<link[^>]*rel=["']icon["'][^>]*>/gi, faviconTag)
} else {
  html = html.replace(/<\/head>/i, `${faviconTag}</head>`)
}

writeFileSync(indexPath, html)
console.log(`[brand-admin] applied title="${ADMIN_TITLE}" + favicon to ${indexPath}`)
