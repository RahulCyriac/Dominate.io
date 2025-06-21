import './App.css';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';


const socket = io('https://your-monopoly-server.onrender.com'); // change to deployed URL in production

const initialBoard = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  name: i % 5 === 0 ? `Special Tile ${i}` : `Property ${i}`,
  type: i % 5 === 0 ? 'special' : 'property',
  price: 100 + i * 10,
  owner: null,
}));

const chanceCards = [
  { text: "🏦 Bank gives you ₹200", action: (player) => { player.money += 200; } },
  { text: "💸 Pay ₹100 to the bank", action: (player) => { player.money -= 100; } },
  { text: "🚶 Move forward 3 tiles", action: (player) => { player.position = (player.position + 3) % 40; } },
  { text: "↩️ Move backward 2 tiles", action: (player) => { player.position = (player.position + 38) % 40; } },
  { text: "🚔 Go to Jail (tile 10)", action: (player) => { player.position = 10; player.isJailed = true; player.jailTurnsLeft = 1; } },
];



function App() {
  const [board, setBoard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [logMessage, setLogMessage] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    socket.on('playerJoined', ({ players }) => {
      setPlayers(players);
    });

    socket.on('gameState', ({ board, players, currentPlayerIndex, log }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLogMessage(log);
    });

    return () => socket.disconnect();
  }, []);

  const joinRoom = () => {
    if (!playerName || !roomId) return;
    socket.emit('joinRoom', { roomId, playerName });
    setJoined(true);
  };

  const startGame = () => {
    socket.emit('startGame', { roomId });
  };

  const rollDice = () => {
    socket.emit('rollDice', { roomId });
  };

  return (
    <div className="App">
      <h1>🎲 Monopoly Multiplayer</h1>
      {!joined ? (
        <div>
          <input
            placeholder="Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <input
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <>
          <p><strong>Room ID:</strong> {roomId}</p>
          <button onClick={startGame}>Start Game</button>
          <h2>Players</h2>
          {players.map((p, idx) => (
            <div key={p.id} style={{ border: idx === currentPlayerIndex ? '2px solid gold' : '1px solid gray', padding: '5px', marginBottom: '5px' }}>
              {p.name} - ₹{p.money} {p.isJailed ? '🚔' : ''}
            </div>
          ))}
          <button onClick={rollDice}>Roll Dice</button>
          <p>{logMessage}</p>
        </>
      )}
    </div>
  );
}

export default App;
