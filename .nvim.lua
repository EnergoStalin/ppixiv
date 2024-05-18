local overseer = require('overseer')

overseer.register_template({
  name = 'build ppxiv',
  builder = function()
    return {
      cmd = 'python build.py && firefox output/ppixiv-main.user.js',
      cwd = vim.fn.getcwd(),
    }
  end,
})
