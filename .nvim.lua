local overseer = require('overseer')

overseer.register_template({
  name = 'build ppxiv',
  builder = function()
    return {
      cmd = 'python build.py',
      cwd = vim.fn.getcwd(),
    }
  end,
})

vim.keymap.set('n', '<c-i>', function()
  overseer.new_task({
    name = 'Build and install',
    components = { 'unique' },
    strategy = {
      'orchestrator',
      tasks = {
        'build ppxiv',
        { 'shell', cmd = 'firefox output/ppixiv-main.user.js' },
      },
    }
  }):start()
end)
