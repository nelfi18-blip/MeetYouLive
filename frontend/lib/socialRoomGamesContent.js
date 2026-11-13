/**
 * Original, curated mini-game content. The backend owns the current round,
 * votes and result; this module only translates the visible prompts/options.
 * Keep six rounds per game and three emoji choices, in all languages.
 */
export const SOCIAL_GAME_TEXT = {
  es: {
    title: "Juegos sociales",
    subtitle: "Jugamos con personas reales de esta sala. Sin apuestas ni Coins.",
    would_you_rather: "¿Qué prefieres?",
    emoji_guess: "Adivina los emojis",
    start: "Empezar",
    switchGame: "Cambiar juego",
    vote: "Elegir",
    voted: "Tu voto está registrado",
    results: "Ver resultados",
    nextRound: "Otra ronda",
    wait: "Espera un momento antes de continuar.",
    join: "Inicia sesión y entra a esta sala para jugar.",
    noPlayers: "Todavía no hay votos. ¡Invita a alguien de la sala!",
    votes: "Votos reales",
    round: "Ronda",
    correct: "Respuesta correcta",
    disconnected: "Conectando con la sala…",
    noGame: "Elige un juego para empezar. Las respuestas son voluntarias.",
    roomGames: "🎮 Juegos",
    error: "No pudimos actualizar la partida. Inténtalo de nuevo.",
    rounds: {
      would_you_rather: [
        ["¿Qué plan escogerías hoy?", ["Explorar una ciudad nueva", "Un día tranquilo junto al mar"]],
        ["Para conocer a alguien, ¿qué te gusta más?", ["Una charla larga", "Compartir una actividad"]],
        ["¿Qué experiencia compartirías?", ["Cocinar juntos", "Ir a un concierto"]],
        ["¿Qué te ilusiona más aprender?", ["Un idioma nuevo", "Tocar un instrumento"]],
        ["¿Qué salida elegirías?", ["Pasear por la naturaleza", "Visitar un museo"]],
        ["En tus días libres, ¿qué prefieres?", ["Un viaje improvisado", "Un plan cuidadosamente organizado"]],
      ],
      emoji_guess: [
        ["🌧️☕📖", ["Fiesta en la calle", "Tarde tranquila", "Viaje en tren"]],
        ["✈️🌍📸", ["Viajar por el mundo", "Cocinar", "Jugar fútbol"]],
        ["🎸🎤🎶", ["Cine", "Pintura", "Concierto"]],
        ["🍿🎬😱", ["Paseo al parque", "Película de terror", "Partido deportivo"]],
        ["🏖️☀️🌊", ["Un día de playa", "Una noche de invierno", "Una montaña nevada"]],
        ["📚🌙☕", ["Una fiesta", "Un paseo de compras", "Estudiar de noche"]],
      ],
    },
  },
  en: {
    title: "Social games",
    subtitle: "Play with real people in this room. No betting or Coins.",
    would_you_rather: "Would you rather?",
    emoji_guess: "Guess the emojis",
    start: "Start",
    switchGame: "Switch game",
    vote: "Choose",
    voted: "Your vote has been recorded",
    results: "Show results",
    nextRound: "Next round",
    wait: "Please wait before continuing.",
    join: "Sign in and join this room to play.",
    noPlayers: "No votes yet. Invite someone in the room!",
    votes: "Real votes",
    round: "Round",
    correct: "Correct answer",
    disconnected: "Connecting to the room…",
    noGame: "Choose a game to begin. Answering is always optional.",
    roomGames: "🎮 Games",
    error: "Couldn't update the game. Please try again.",
    rounds: {
      would_you_rather: [
        ["Which plan would you pick today?", ["Explore a new city", "A quiet day by the sea"]],
        ["When meeting someone, what do you prefer?", ["A long conversation", "Doing an activity together"]],
        ["What experience would you share?", ["Cooking together", "Going to a concert"]],
        ["What are you more excited to learn?", ["A new language", "A musical instrument"]],
        ["Which outing would you choose?", ["A nature walk", "Visiting a museum"]],
        ["On your day off, what sounds best?", ["An unplanned trip", "A carefully planned day"]],
      ],
      emoji_guess: [
        ["🌧️☕📖", ["Street party", "A cozy afternoon", "Train journey"]],
        ["✈️🌍📸", ["Traveling the world", "Cooking", "Playing soccer"]],
        ["🎸🎤🎶", ["Cinema", "Painting", "Concert"]],
        ["🍿🎬😱", ["Going to the park", "Horror movie", "Sports match"]],
        ["🏖️☀️🌊", ["A beach day", "Winter evening", "Snowy mountain"]],
        ["📚🌙☕", ["A party", "Shopping", "Late-night studying"]],
      ],
    },
  },
  pt: {
    title: "Jogos sociais",
    subtitle: "Jogue com pessoas reais nesta sala. Sem apostas ou Coins.",
    would_you_rather: "O que você prefere?",
    emoji_guess: "Adivinhe os emojis",
    start: "Começar",
    switchGame: "Trocar jogo",
    vote: "Escolher",
    voted: "Seu voto foi registrado",
    results: "Ver resultados",
    nextRound: "Outra rodada",
    wait: "Espere um momento antes de continuar.",
    join: "Entre na conta e na sala para jogar.",
    noPlayers: "Ainda não há votos. Convide alguém da sala!",
    votes: "Votos reais",
    round: "Rodada",
    correct: "Resposta correta",
    disconnected: "Conectando à sala…",
    noGame: "Escolha um jogo para começar. Responder é opcional.",
    roomGames: "🎮 Jogos",
    error: "Não foi possível atualizar o jogo. Tente novamente.",
    rounds: {
      would_you_rather: [
        ["Qual programa você escolheria hoje?", ["Explorar uma cidade nova", "Um dia tranquilo à beira-mar"]],
        ["Para conhecer alguém, você prefere?", ["Uma conversa longa", "Fazer uma atividade juntos"]],
        ["Que experiência você compartilharia?", ["Cozinhar juntos", "Ir a um show"]],
        ["O que gostaria mais de aprender?", ["Um idioma novo", "Um instrumento musical"]],
        ["Qual passeio escolheria?", ["Caminhar na natureza", "Visitar um museu"]],
        ["No dia livre, você prefere?", ["Uma viagem improvisada", "Um passeio bem planejado"]],
      ],
      emoji_guess: [
        ["🌧️☕📖", ["Festa na rua", "Tarde tranquila", "Viagem de trem"]],
        ["✈️🌍📸", ["Viajar pelo mundo", "Cozinhar", "Jogar futebol"]],
        ["🎸🎤🎶", ["Cinema", "Pintura", "Show de música"]],
        ["🍿🎬😱", ["Passeio no parque", "Filme de terror", "Jogo esportivo"]],
        ["🏖️☀️🌊", ["Dia de praia", "Noite de inverno", "Montanha com neve"]],
        ["📚🌙☕", ["Uma festa", "Fazer compras", "Estudar à noite"]],
      ],
    },
  },
};

export function getSocialGameContent(lang, type, roundIndex) {
  const copy = SOCIAL_GAME_TEXT[lang] || SOCIAL_GAME_TEXT.es;
  const rounds = copy.rounds[type];
  if (!Array.isArray(rounds) || !Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= rounds.length) {
    return null;
  }
  const [question, options] = rounds[roundIndex];
  return { question, options, copy };
}
