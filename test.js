const router = require('express').Router();


router.get('/test',async function(req,res){
    res.send({
      code:200,
      msg:'success!'
    })
})

module.exports = router