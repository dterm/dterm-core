import {joinPath} from './common.js'

var config = {
  lsAfterCd: true
}

// interactive help
// =

const METHOD_HELP = [
  {name: 'ls', description: 'List files in the directory'},
  {name: 'cd', description: 'Change the current directory'},
  {name: 'pwd', description: 'Fetch the current directory'},
  {name: 'mkdir', description: 'Make a new directory'},
  {name: 'rmdir', description: 'Remove an existing directory'},
  {name: 'mv', description: 'Move a file or folder'},
  {name: 'cp', description: 'Copy a file or folder'},
  {name: 'rm', description: 'Remove a file'},
  {name: 'echo', description: 'Output the arguments'}
]

export function help () {
  return {
    toHTML() {
      var longestMethod = METHOD_HELP.reduce((acc, v) => Math.max(acc, v.name.length), 0)
      var lines = METHOD_HELP.map(method => {
        var nSpaces = longestMethod + 2 - method.name.length
        var methodEl = env.html`<span>${method.name}${'&nbsp;'.repeat(nSpaces)}</span>`
        return env.html`<div class="text-default">${methodEl} <span class="text-muted">${method.description || ''}</span></div>`
      })
      return env.html`<div>${lines}</div>`
    }
  }
}

// current working directory methods
// =

export async function ls (opts = {}, location = '') {
  location = joinPath(window.location.pathname, location)

  // if home dir, use library to populate
  if (location === '/') {
    var library = await experimental.library.list()

    library.toHTML = () => env.html`<div>
      ${library.map(archive => env.html`<div>${archive.title} (${archive.url})</div>`)}
    </div>`

    return library
  }

  // inside archive, use directory listing
  var {archive, path} = env.getCWD()
  var listing = await archive.readdir(path, {stat: true})

  // render
  listing.toHTML = () => env.html`<div>${listing
    .filter(entry => {
      if (opts.all || opts.a) {
        return true
      }
      return entry.name.startsWith('.') === false
    })
    .sort((a, b) => {
      // dirs on top
      if (a.stat.isDirectory() && !b.stat.isDirectory()) return -1
      if (!a.stat.isDirectory() && b.stat.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })
    .map(entry => {
      // coloring
      var color = 'default'
      if (entry.name.startsWith('.')) {
        color = 'muted'
      }

      function onclick (e) {
        e.preventDefault()
        e.stopPropagation()
        env.evalCommand(`cd ${entry.name}`)
      }

      // render
      const entryUrl = archive.url + joinPath(location, entry.name)
      const tag = entry.stat.isDirectory() ? 'strong' : 'span'
      return env.html`
        <div class="text-${color}">
          <${tag}>
            <a
              href=${entryUrl}
              onclick=${entry.stat.isDirectory() ? onclick : undefined}
              target="_blank"
            >${entry.name}</a>
          </${tag}>
        </div>`
    })
  }</div>`

  return listing
}

export async function cd (opts = {}, location = '') {
  location = location.toString()

  if (location.startsWith('dat://')) {
    location = location.replace(/^dat:\//, '')
  } else if (location.startsWith('/')) {
    location = location.replace(/^\//, '/' + env.getCWD().key)
  } else if (location.startsWith('~')) {
    location = location.startsWith('~/')
      ? location.replace(/^~\//, '/')
      : '/'
  } else {
    location = joinPath(window.location.pathname, location)
  }

  await env.setCWD(location)

  if (config.lsAfterCd) {
    return ls()
  }
}

export function pwd () {
  var path = '~'
  var cwd = env.getCWD()

  if (cwd) {
    path += `/${cwd.key}/${cwd.path}`
  }
  return path
}

// folder manipulation
// =

export async function mkdir (opts, dst) {
  if (!dst) throw new Error('dst is required')
  const cwd = env.getCWD()
  dst = toCWDLocation(dst)
  await cwd.archive.mkdir(dst)
}

export async function rmdir (opts, dst) {
  if (!dst) throw new Error('dst is required')
  const cwd = env.getCWD()
  dst = toCWDLocation(dst)
  var opts = {recursive: opts.r || opts.recursive}
  await cwd.archive.rmdir(dst, opts)
}

// file & folder manipulation
// =

export async function mv (opts, src, dst) {
  if (!src) throw new Error('src is required')
  if (!dst) throw new Error('dst is required')
  const cwd = env.getCWD()
  src = toCWDLocation(src)
  dst = toCWDLocation(dst)
  await cwd.archive.rename(src, dst)
}

export async function cp (opts, src, dst) {
  if (!src) throw new Error('src is required')
  if (!dst) throw new Error('dst is required')
  const cwd = env.getCWD()
  src = toCWDLocation(src)
  dst = toCWDLocation(dst)
  await cwd.archive.copy(src, dst)
}

// file manipulation
// =

export async function rm (opts, dst) {
  if (!dst) throw new Error('dst is required')
  const cwd = env.getCWD()
  dst = toCWDLocation(dst)
  await cwd.archive.unlink(dst)
}

// command management
// =

export async function install (opts, cmd, url) {
  if (!cmd) throw new Error('cmd is required')
  url = url || joinPath(env.getCWD().url, `${cmd}.js`)
  var urlp = new URL(url)
  var dat = await DatArchive.load(urlp.host)
  var stat = await dat.stat(urlp.pathname)
  if (stat.isDirectory()) throw new Error('command can not be loaded from directory')
  localStorage.setItem(`cmd/${cmd}`, url)
}

export function which (opts, cmd) {
  var installed = localStorage.getItem(`cmd/${cmd}`)
  if (installed) return installed
  if (cmd in this) return import.meta.url
  throw new Error('command not found')
}

// utilities
// =

export async function echo (opts, ...args) {
  var appendFlag = opts.a || opts.append
  var res = args.join(' ')
  const cwd = env.getCWD()

  if (opts.to) {
    let dst = toCWDLocation(opts.to)
    if (appendFlag) {
      let content = await cwd.archive.readFile(dst, 'utf8')
      res = content + res
    }
    await cwd.archive.writeFile(dst, res)
  } else {
    return res
  }
}

export function exit (opts, code) {
  code = Number(code || 0)
  if (isNaN(code)) throw new Error('invalid exit code')
  window.close(code)
}

// internal methods
// =

function toCWDLocation (location) {
  const cwd = env.getCWD()
  location = location.toString()
  if (!location.startsWith('/')) {
    location = joinPath(cwd.pathname, location)
  }
  return location
}
