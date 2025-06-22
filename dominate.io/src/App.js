import './App.css';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://dominate-io.onrender.com');

function App() {
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [roomId, setRoomId] = useState(localStorage.getItem('roomId') || '');
  const [board, setBoard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [logMessage, setLogMessage] = useState('');
  const [joined, setJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [auction, setAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState(0);

  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeWith, setTradeWith] = useState('');
  const [offerAmount, setOfferAmount] = useState(0);
  const [requestAmount, setRequestAmount] = useState(0);
  const [offerProps, setOfferProps] = useState([]);
  const [requestProps, setRequestProps] = useState([]);
  const [incomingTrade, setIncomingTrade] = useState(null);

  const thisIdx = players.findIndex(p => p.id === socket.id);
  const thisPlayer = players[thisIdx] || {};
  const isMyTurn = thisIdx === currentPlayerIndex;
  const inDebt = thisPlayer.money < 0;
  const isBankrupt = thisPlayer.isBankrupt;
  const isJailed = thisPlayer.isJailed;

  useEffect(() => {
    if (roomId && playerName) {
      socket.emit('reconnectRoom', { roomId, playerName });
    }

    socket.on('roomJoined', ({ players, roomId, isHost }) => {
      setPlayers(players);
      setRoomId(roomId);
      setJoined(true);
      setIsHost(isHost);
    });

    socket.on('playerJoined', ({ players }) => setPlayers(players));

    socket.on('gameState', ({ board, players, currentPlayerIndex, log }) => {
      setBoard(board);
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setLogMessage(log);
      setGameStarted(true);
      setTradeOpen(false);
      setIncomingTrade(null);
      setOfferProps([]);
      setRequestProps([]);
    });

    socket.on('startAuction', ({ property }) => setAuction({ property, highestBid: 0 }));
    socket.on('updateAuction', data => setAuction(data));
    socket.on('endAuction', () => setAuction(null));
    socket.on('incomingTrade', data => setIncomingTrade(data));
    socket.on('chatMessage', ({ message, sender }) =>
      setMessages(ms => [...ms, { message, sender }])
    );
    socket.on('errorMessage', ({ message }) => alert(message));
    socket.on('gameOver', ({ winner }) => alert(`🏆 Winner: ${winner}`));

    return () => socket.disconnect();
  }, []);

  const createRoom = () => {
    if (!playerName) return;
    localStorage.setItem('playerName', playerName);
    socket.emit('createRoom', { playerName });
  };
  const joinRoom = () => {
    if (!playerName || !roomId) return;
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('roomId', roomId);
    socket.emit('joinRoom', { playerName, roomId });
  };

  const startGame = () => socket.emit('startGame', { roomId });
  const rollDice = () => socket.emit('rollDice', { roomId });
  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit('chatMessage', { roomId, message: chatInput, sender: playerName });
    setChatInput('');
  };
  const placeBid = () => {
    if (bidAmount > 0) {
      socket.emit('placeBid', { roomId, bid: bidAmount });
      setBidAmount(0);
    }
  };
  const endAuction = () => socket.emit('endAuction', { roomId });
  const build = pid => socket.emit('build', { roomId, propertyId: pid });
  const payJail = () => socket.emit('payToLeaveJail', { roomId });
  const bankrupt = () => socket.emit('declareBankruptcy', { roomId });

  const sendTradeOffer = () => {
    if (!tradeWith) return;
    socket.emit('tradeOffer', {
      roomId,
      from: socket.id,
      to: tradeWith,
      offerAmount,
      requestAmount,
      offerProps,
      requestProps
    });
    setTradeOpen(false);
  };
  const respondToTrade = accepted => {
    socket.emit('respondToTrade', {
      roomId,
      accepted,
      from: incomingTrade.from,
      offerAmount: incomingTrade.offerAmount,
      requestAmount: incomingTrade.requestAmount,
      offerProps: incomingTrade.offerProps,
      requestProps: incomingTrade.requestProps
    });
    setIncomingTrade(null);
  };

  const renderBoard = () => (
    <div className="board">
      {board.map((tile, i) => (
        <div key={i} className="tile">
          <div>{tile.name}</div>
          <div className="players">
            {players
              .filter(p => p.position === i)
              .map(p => (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: p.color,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    margin: '2px'
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="App">
      <h1>🎲 Monopoly Multiplayer</h1>

      {!joined ? (
        <div>
          <input
            placeholder="Name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />
          <input
            placeholder="Room ID"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
          />
          <button onClick={createRoom}>Create Room</button>
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : gameStarted ? (
        <>
          <p>
            <strong>Room ID:</strong> {roomId}{' '}
            {isHost && <button onClick={startGame}>Restart Game</button>}
          </p>
          <p><strong>Turn:</strong> {players[currentPlayerIndex]?.name}</p>
          {renderBoard()}
          {isMyTurn && !isBankrupt && (
            <div className="actions">
              {!isJailed && <button onClick={rollDice} disabled={inDebt}>Roll Dice</button>}
              {isJailed && <button onClick={payJail}>Pay ₹50 to Leave Jail</button>}
              {inDebt && <button onClick={bankrupt}>Declare Bankruptcy</button>}
              <button onClick={() => setTradeOpen(true)}>Propose Trade</button>
            </div>
          )}
        </>
      ) : (
        <>
          <p>
            <strong>Room ID:</strong> {roomId}{' '}
            {isHost && <button onClick={startGame}>Start Game</button>}
          </p>
          <h2>Players</h2>
          {players.map((p, i) => (
            <div
              key={p.id}
              style={{
                border: i === currentPlayerIndex ? '2px solid gold' : '1px solid gray',
                padding: '5px',
                marginBottom: '5px'
              }}
            >
              {p.name} — ₹{p.money} {p.isJailed && '🚔'} {p.isBankrupt && '(Bankrupt)'}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default App;
