const {
  io,
  registerCommand,
  tokenVault,
  saveEncryptedTokens,
  getCurrentBotTokenIndex
} = require('../../bot');

function vaultPayload() {
  return {
    tokens: tokenVault.map((t, i) => ({
      index: i,
      name: t.name || ('Token ' + (i + 1)),
      avatar: t.avatar || ''
    })),
    active_index: getCurrentBotTokenIndex()
  };
}

registerCommand('token_list')(async (params, { socket }) => {
  socket.emit('token_list', vaultPayload());
});

registerCommand('add_token')(async (params, { socket }) => {
  const token = (params.token || '').trim();
  if (!token) return;
  tokenVault.push({ token: token, name: '', avatar: '' });
  saveEncryptedTokens(tokenVault);
  io.emit('token_list', vaultPayload());
  socket.emit('notification', 'Token added');
});

registerCommand('remove_token')(async (params, { socket }) => {
  const idx = parseInt(params.index, 10);
  if (!isNaN(idx) && idx >= 0 && idx < tokenVault.length) {
    tokenVault.splice(idx, 1);
    saveEncryptedTokens(tokenVault);
  }
  io.emit('token_list', vaultPayload());
  socket.emit('notification', 'Token removed');
});

module.exports = {};