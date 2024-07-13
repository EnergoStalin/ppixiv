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

overseer.run_template({ name = 'http', params = { cwd = vim.fn.getcwd(), path = './output/ppixiv-main.user.js', address = '0.0.0.0', port = 8080 } })

overseer.register_template({
  name = 'ppixiv AdbYandexBrowserOpen',
  builder = function ()
    return {
      name = 'ppixiv adb open',
      cmd = '',
      components = {
        'default',
        {
          'dependencies',
          task_names = {
            { 'AdbYandexBrowserOpen', url = 'http://%local%:8080/ppixiv-main.user.js' }
          }
        },
      }
    }
  end
})
