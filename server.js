
const express=require('express');
const app=express();
const http=require('http').Server(app);
const io=require('socket.io')(http);

app.use(express.static(__dirname));
app.get('/',(req,res)=>{res.sendFile(__dirname+'/index.html');});

io.on('connection',(socket)=>{
    console.log('Player connected'); 
    socket.on('disconnect',()=>{console.log('Player disconnected');});
});

http.listen(3000,()=>{console.log('Server running on port 3000');});
