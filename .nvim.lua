local overseer = require('overseer')

local default = {
  {
    'on_complete_dispose',
    require_view = { 'FAILURE', },
    timeout = 10
  },
  'unique',
  'default',
}

overseer.register_template({
  name = 'build',
  builder = function()
    return {
      name = 'build',
      cmd = 'python ./build.py',
      cwd = vim.fn.getcwd(),
      components = default,
    }
  end,
})

overseer.register_template({
  name = 'install',
  builder = function()
    return {
      name = 'install',
      cmd = 'xdg-open http://127.0.0.1:8080/ppixiv-main.user.js',
      components = default,
    }
  end,
})

overseer.run_template({ name = 'http', params = { cwd = vim.fn.getcwd(), path = './output/ppixiv-main.user.js', address = '0.0.0.0', port = 8080 } })

overseer.register_template({
  name = 'android install dev',
  builder = function()
    return {
      name = 'adb open',
      components = default,
      strategy = {
        "orchestrator",
        tasks = {
          {
            'AdbYandexBrowserOpen',
            url = 'http://%local%:8080/ppixiv-main.user.js',
            components = default,
          }
        },
      },
    }
  end
})

overseer.register_template({
  name = 'android install git',
  builder = function()
    return {
      name = 'adb open',
      components = default,
      strategy = {
        "orchestrator",
        tasks = {
          {
            'AdbYandexBrowserOpen',
            url = 'https://github.com/EnergoStalin/ppixiv/releases/latest/download/ppixiv-main.user.js',
            components = default,
          }
        },
      },
    }
  end
})

overseer.register_template({
  name = 'install git',
  builder = function()
    return {
      name = 'xdg-open',
      cmd = ' xdg-open https://github.com/EnergoStalin/ppixiv/releases/latest/download/ppixiv-main.user.js',
      components = default,
    }
  end
})
