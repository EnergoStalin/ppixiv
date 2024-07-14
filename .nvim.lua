local overseer = require('overseer')

overseer.register_template({
  name = 'build',
  builder = function()
    return {
      name = 'build',
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
  name = 'install',
  builder = function()
    return {
      name = 'install',
      cmd = 'firefox ./output/ppixiv-main.user.js',
      cwd = vim.fn.getcwd(),
      components = {
        'unique',
        'default',
        {
          'dependencies',
          task_names = {
            'build'
          }
        },
      }
    }
  end,
})

overseer.run_template({ name = 'http', params = { cwd = vim.fn.getcwd(), path = './output/ppixiv-main.user.js', address = '0.0.0.0', port = 8080 } })

overseer.register_template({
  name = 'android install dev',
  builder = function()
    return {
      name = 'adb open',
      strategy = {
        "orchestrator",
        tasks = {
          { 'AdbYandexBrowserOpen', url = 'http://%local%:8080/ppixiv-main.user.js' }
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
      strategy = {
        "orchestrator",
        tasks = {
          {
            'AdbYandexBrowserOpen',
            url = 'https://github.com/EnergoStalin/ppixiv/releases/latest/download/ppixiv-main.user.js'
          }
        },
      },
    }
  end
})
