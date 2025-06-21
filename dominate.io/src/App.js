import './App.css';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://dominate-io.onrender.com');

function App() {
  const [board, setBoard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [logMessage, setLogMessage] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on('roomJoined', ({ players, roomId, isHost }) => {
      setPlayers(players);
      setRoomId(roomId);
      setJoined(true);
      setIsHost(isHost);
    });

    socket.on('playerJoined', ({ players }) => {
      setPlayers(players);
    });

    socket.on('gameState', ({ board, players, currentPlayerIndex, log }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLogMessage(log);
    });

    socket.on('chatMessage', ({ message, sender }) => {
      setMessages(prev => [...prev, { message, sender }]);
    });

    return () => socket.disconnect();
  }, []);

  const createRoom = () => {
    if (!playerName) return;
    socket.emit('createRoom', { playerName });
  };

  const joinRoom = () => {
    if (!playerName || !roomId) return;
    socket.emit('joinRoom', { playerName, roomId });
  };

  const startGame = () => {
    socket.emit('startGame', { roomId });
  };

  const rollDice = () => {
    socket.emit('rollDice', { roomId });
  };

  const sendChat = () => {
    if (chatInput.trim()) {
      socket.emit('chatMessage', { roomId, message: chatInput, sender: playerName });
      setChatInput('');
    }
  };

  return (
    <div className="App">
      <h1>🎲 Monopoly Multiplayer</h1>

      {!joined ? (
        <div>
          <input placeholder="Name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          <input placeholder="Room ID (to join)" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          <button onClick={createRoom}>Create Room</button>
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <>
          <p><strong>Room ID:</strong> {roomId}</p>
          {isHost && <button onClick={startGame}>Start Game</button>}

          <h2>Players</h2>
          {players.map((p, idx) => (
            <div
              key={p.id}
              style={{
                border: idx === currentPlayerIndex ? '2px solid gold' : '1px solid gray',
                padding: '5px',
                marginBottom: '5px'
              }}
            >
              {p.name} - ₹{p.money ?? 1500} {p.isJailed ? '🚔' : ''}
            </div>
          ))}

          <button onClick={rollDice}>Roll Dice</button>
          <p>{logMessage}</p>

          {/* 🎯 Board rendering here */}
          <div className="board">
            {board.map((tile) => (
              <div key={tile.id} className="tile">
                <div>{tile.name}</div>

                {/* Show all players on this tile */}
                {players
                  .filter(p => p.position === tile.id)
                  .map(p => (
                    <div
                      key={p.id}
                      className="player"
                      style={{ backgroundColor: p.color }}
                      title={p.name}
                    />
                  ))}
              </div>
            ))}
          </div>

          {/* 💬 Chat */}
          <div>
            <h3>💬 Chat</h3>
            <div style={{ maxHeight: '150px', overflowY: 'auto', background: '#eee', padding: '5px' }}>
              {messages.map((msg, idx) => (
                <div key={idx}><strong>{msg.sender}:</strong> {msg.message}</div>
              ))}
            </div>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
            />
            <button onClick={sendChat}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
