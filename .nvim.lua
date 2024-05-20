local overseer = require('overseer')

overseer.register_template({
  name = 'build ppixiv',
  builder = function()
    return {
      name = 'build ppixiv',
      cmd = 'python ./build.py',
      cwd = vim.fn.getcwd(),
      components = {
        'unique',
        'default',
      }
    }
  end,
})

overseer.register_template({
  name = 'install ppixiv',
  builder = function()
    return {
      name = 'install ppixiv',
      cmd = 'firefox ./output/ppixiv-main.user.js',
      cwd = vim.fn.getcwd(),
      components = {
        'unique',
        'default',
        {
          'dependencies',
          task_names = {
            'build ppixiv'
          }
        },
      }
    }
  end,
})

overseer.register_template({
  name = 'adb push ppixiv',
  builder = function()
    return {
      name = 'adb push',
      cmd = {
        'adb',
        'push',
        './output/ppixiv-main.user.js',
        '/storage/emulated/0/',
      },
      cwd = vim.fn.getcwd(),
      components = {
        'default',
        'unique',
      }
    }
  end
})

overseer.register_template({
  name = 'nginx',
  params = {
    path = {
      type = 'string',
      optional = false
    },
    port = {
      type = 'number',
      default = 8080,
      optional = true
    },
    address = {
      type = 'string',
      default = '127.0.0.1',
      optional = true
    },
    cwd = {
      type = 'string',
      optional = true
    }
  },
  builder = function(opts)
    local nginx_conf = vim.fn.tempname()
    local nginx_pid = vim.fn.tempname()
    local file_to_serve = vim.fn.fnamemodify(opts.path, ':t')

    local fp = io.open(nginx_conf, 'w')
    if not fp then
      return
    end

    fp:write(
      string.format(
        [[
          daemon off;
          error_log /dev/stdout;

          pid %s;

          events {
            worker_connections 1024;
          }

          http {
            server {
              access_log /dev/stdout;

              listen %s:%d;
              location = /%s { alias %s; }
            }
          }
        ]],
        nginx_pid,
        opts.address,
        opts.port,
        file_to_serve,
        file_to_serve
      )
    )
    fp:close()

    return {
      name = 'serving ' .. opts.path,
      cmd = {
        'nginx', '-c', nginx_conf, '-p', vim.fn.fnamemodify(opts.path, ':h')
      },
      cwd = opts.cwd,
      components = {
        'default',
        'unique',
      }
    }
  end
})

overseer.run_template({ name = 'nginx', params = { cwd = vim.fn.getcwd(), path = './output/ppixiv-main.user.js', address = '0.0.0.0', port = 8080 } })

overseer.register_template({
  name = 'adb open ppixiv',
  builder = function()
    local ip = io.popen('ip addr show eno1 | grep "inet " | cut -d" " -f6 | cut -d/ -f1'):read()
    return {
      name = 'adb open',
      cmd = {
        'adb',
        'shell',
        'am start -n com.yandex.browser/com.yandex.browser.YandexBrowserMainActivity -a android.intent.action.VIEW -d http://' .. ip .. ':8080/ppixiv-main.user.js'
      },
      cwd = vim.fn.getcwd(),
      components = {
        'default',
        'unique',
        {
          'dependencies',
          task_names = {
            'build ppixiv',
            'adb push ppixiv'
          },
          sequential = true
        },
      }
    }
  end
})
