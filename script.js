// --- JAVASCRIPT LOGIC ---

// --- 1. CONFIGURATION ---
// This section holds configuration that can be easily modified
const CONFIG = {
    MAX_LIVES: 6,
    POINTS_PER_LETTER: 10,
    POINTS_PER_WORD: 100,
    POINTS_BONUS_PER_LIFE: 10,
    // NEW: Point costs for different hint types
    HINT_COSTS: {
        definition: -5,
        letter: -3,
        grammaticalFeatures: -7,
        lexicalCategory: -6, // NEW: Cost for lexical category hint
        image: -10, // NEW: Cost for image hint (adjust as needed)
        // Add more if needed
    },
    API_BASE_URL: 'https://query.wikidata.org/sparql',
    // NEW: API URL for fetching labels
    LABEL_API_URL: 'https://www.wikidata.org/w/api.php',
    // SPARQL query template to fetch lexemes based on language code and word length range
    // Note: LANG_PLACEHOLDER, MIN_LENGTH_PLACEHOLDER, MAX_LENGTH_PLACEHOLDER will be replaced dynamically
    SPARQL_QUERY_TEMPLATE: `
        SELECT ?lexeme ?lemma ?definition ?grammaticalFeature ?translation ?pronunciation ?image ?lexicalCategory WHERE {
          ?lexeme a ontolex:LexicalEntry ;
                  dct:language LANG_PLACEHOLDER ;
                  wikibase:lemma ?lemma .

          OPTIONAL { ?lexeme wdt:P5137 ?definition. }
          OPTIONAL { ?lexeme wdt:P5185 ?grammaticalFeature. }

          OPTIONAL {
            ?lexeme wdt:P5972 ?translation .
            FILTER(LANG(?translation) != LANG(?lemma))
          }

          OPTIONAL { ?lexeme wdt:P443 ?pronunciation. }
          OPTIONAL { ?lexeme wikibase:lexicalCategory ?lexicalCategory . }

          # --- IMAGE SOURCES ---
          # 1. Image from item for this sense
          OPTIONAL {
            ?lexeme wdt:P5137 ?senseItem .
            ?senseItem wdt:P18 ?image .
          }

          # 2. Image from sense entity
          OPTIONAL {
            ?lexeme ontolex:sense ?sense .
            ?sense wdt:P18 ?image .
          }

          # 3. Image from form entity
          OPTIONAL {
            ?lexeme ontolex:form ?form .
            ?form wdt:P18 ?image .
          }

          # Word length filter
          BIND(STRLEN(STR(?lemma)) AS ?len)
          FILTER(?len >= MIN_LENGTH_PLACEHOLDER && ?len <= MAX_LENGTH_PLACEHOLDER)

          # Language filter
          FILTER(LANG(?lemma) = "LANG_CODE_PLACEHOLDER")
        }
        LIMIT 100
    `,
    // NEW: Map difficulty levels to word length ranges
    DIFFICULTY_LEVELS: {
        "beginner": { min: 1, max: 3 },
        "easy":     { min: 4, max: 5 },
        "medium":   { min: 6, max: 7 },
        "hard":     { min: 8, max: 10 },
        "expert":   { min: 11, max: 25 } // Set a reasonable max, adjust if needed
    },
    // Map language codes to Wikidata Q-IDs for the dct:language property
    // You might need to expand this list. Example Q-IDs:
    // English: Q1860, Spanish: Q1321, French: Q150, German: Q188, Dagbani: Q32238
    LANGUAGE_CODE_TO_QID: {
        "en": "Q1860",
        "es": "Q1321",
        "fr": "Q150",
        "de": "Q188",
        "dag": "Q32238" // Corrected Dagbani Q-ID
        // Add more mappings as needed
    }
};

// --- 2. GAME STATE ---
// This object holds the current state of the game
let gameState = {
    currentWord: "",
    currentLemma: "", // Store the original lemma from Wikidata
    currentDefinition: "",
    currentGrammaticalFeatures: "", // Store grammatical features
    currentTranslations: "", // Store translations
    currentPronunciation: "", // Store pronunciation info
    currentImages: [], // NEW: Store array of image URLs
    currentLexicalCategoryQid: "", // Store the Q-ID of the lexical category
    currentLexicalCategoryLabel: "", // Store the human-readable label of the lexical category
    currentLanguageCode: "dag", // Default language
    currentLanguageName: "Dagbani", // Default language name
    currentDifficulty: "easy", // Store the current difficulty level
    guessedLetters: [], // Letters guessed by the player
    correctLetters: [], // Letters that have been correctly guessed or revealed via hints (used for display logic if needed elsewhere, but not for position-specific reveal)
    correctIndices: [], // Track *which positions* in the word have been correctly revealed/guessed
    lives: CONFIG.MAX_LIVES,
    score: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    isGameActive: false, // Start as false until initialized
    isLoading: false, // Track if data is being fetched
    // Track hint usage per type
    hintUsage: {
        definition: 0,
        letter: 0, // Track letter hint usage if needed
        grammaticalFeatures: 0,
        lexicalCategory: 0, // Track lexical category hint usage
        image: 0, // NEW: Track image hint usage
        // Add more if needed
    }
};

// --- 3. DOM ELEMENTS CACHE ---
// Cache DOM elements for easier access
const domElements = {
    wordDisplay: document.getElementById('wordDisplay'),
    // Update hint element reference
    dynamicHintArea: document.getElementById('dynamicHintArea'),
    // Add the container for revealed hints
    revealedHintsContainer: document.getElementById('revealedHintsContainer'),
    // Individual hint elements are now part of endGameDetails - we'll get them when needed or cache them differently if frequently accessed during game
    // definitionElement: document.getElementById('definition'), // REMOVED: No longer exists with this ID
    // grammaticalFeaturesElement: document.getElementById('grammaticalFeatures'), // REMOVED: No longer exists with this ID in the main hint area
    // translationsElement: document.getElementById('translations'), // REMOVED: No longer exists with this ID in the main hint area
    // pronunciationElement: document.getElementById('pronunciation'), // REMOVED: No longer exists with this ID in the main hint area
    // imagesElement: document.getElementById('images'), // REMOVED: No longer exists with this ID in the main hint area
    // Add lexical category element - REMOVED from here too
    // lexicalCategoryElement: document.getElementById('lexicalCategory'), // REMOVED: No longer exists with this ID in the main hint area
    // Add end-game details section - This is the container
    endGameDetails: document.getElementById('endGameDetails'),
    languageDisplay: document.getElementById('languageDisplay'),
    languageCodeDisplay: document.getElementById('languageCodeDisplay'),
    guessInput: document.getElementById('guessInput'),
    // Update hint button references and ADD submitBtn
    submitBtn: document.getElementById('submitBtn'), // This was missing!
    getDefinitionHintBtn: document.getElementById('getDefinitionHintBtn'),
    getLetterHintBtn: document.getElementById('getLetterHintBtn'),
    getGrammaticalHintBtn: document.getElementById('getGrammaticalHintBtn'),
    // Add lexical category button
    getLexicalCategoryHintBtn: document.getElementById('getLexicalCategoryHintBtn'),
    // NEW: Add image button
    getImageHintBtn: document.getElementById('getImageHintBtn'),
    newGameBtn: document.getElementById('newGameBtn'),
    feedbackElement: document.getElementById('feedback'),
    livesElement: document.getElementById('lives'),
    scoreElement: document.getElementById('score'),
    gamesPlayedElement: document.getElementById('gamesPlayed'),
    gamesWonElement: document.getElementById('gamesWon'),
    winRateElement: document.getElementById('winRate'),
    languageSelect: document.getElementById('languageSelect'),
    // Add the difficulty select and how-to/about elements
    difficultySelect: document.getElementById('difficultySelect'),
    howToPlayBtn: document.getElementById('howToPlayBtn'),
    howToPlayContent: document.getElementById('howToPlayContent'),
    aboutBtn: document.getElementById('aboutBtn'),
    aboutContent: document.getElementById('aboutContent')
};

// --- 4. CORE GAME LOGIC FUNCTIONS ---
// These functions handle the core game mechanics

/**
 * Initializes the game state and starts a new round.
 */
function initGame() {
    if (gameState.isLoading) return; // Prevent multiple fetches if one is ongoing

    resetGameState();
    gameState.isGameActive = true;
    gameState.isLoading = true; // Set loading flag
    updateDisplay(); // Show loading state

    // Get the selected difficulty level
    gameState.currentDifficulty = domElements.difficultySelect.value; // Store in gameState

    // Fetch a new word based on the selected language and difficulty
    // CHANGED: Pass the difficulty level to the fetch function
    fetchRandomWordFromWikidata(gameState.currentLanguageCode, gameState.currentDifficulty)
        .then(() => {
            gameState.isLoading = false; // NEW: Ensure loading is set to false after successful fetch
            gameState.currentLanguageName = getLanguageName(gameState.currentLanguageCode);
            updateDisplay(); // Update display again after word is fetched
        })
        .catch(error => {
            console.error("Error fetching word from Wiki", error);
            gameState.isLoading = false; // NEW: Ensure loading is set to false after failed fetch
            let errorMessage = "Failed to load a new word from Wikidata. Please try again.";

            // Try to provide a more specific error message based on the error object
            if (error.message && error.message.includes('No lexemes found')) {
                // This specific error comes from our fetchRandomWordFromWikidata function
                const selectedDifficulty = domElements.difficultySelect.value; // Get current selection for error
                const range = CONFIG.DIFFICULTY_LEVELS[selectedDifficulty];
                errorMessage = `No words found for the selected language and difficulty (${range.min}-${range.max} letters). Try a different difficulty or language.`;
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                // This might catch network errors (like no internet)
                 errorMessage = "Network error: Could not connect to Wikidata. Please check your internet connection.";
            } else if (error.status) {
                // This might catch specific HTTP errors (like 404, 500) from the API response
                errorMessage = `Wikidata API error: Received status code ${error.status}. Please try again later.`;
            }

            showFeedback(errorMessage, false);
            gameState.isGameActive = false; // Stop game if fetch fails
            updateDisplay(); // Update display to show error
        });
}

/**
 * Resets the game state for the current round.
 */
function resetGameState() {
    gameState.guessedLetters = [];
    gameState.correctLetters = [];
    gameState.correctIndices = []; // Reset correct indices
    gameState.currentLexicalCategoryQid = ""; // Reset lexical category Q-ID
    gameState.currentLexicalCategoryLabel = ""; // Reset lexical category label
    gameState.currentImages = []; // NEW: Reset images array
    gameState.lives = CONFIG.MAX_LIVES;
    gameState.score = 0; // Reset score for new game
    // Reset hint usage
    gameState.hintUsage = {
        definition: 0,
        letter: 0,
        grammaticalFeatures: 0,
        lexicalCategory: 0, // Reset lexical category hint usage
        image: 0, // NEW: Reset image hint usage
        // Add more if needed
    };
    // Keep isGameActive as false until initGame is called
    // gameState.isGameActive = false; // This is already set in the initial gameState object
    domElements.guessInput.value = '';
    domElements.feedbackElement.innerHTML = '';
    domElements.guessInput.disabled = false;
    domElements.getDefinitionHintBtn.disabled = false; // Reset button states
    domElements.getLetterHintBtn.disabled = false;
    domElements.getGrammaticalHintBtn.disabled = false;
    domElements.getLexicalCategoryHintBtn.disabled = false; // Reset lexical category button state
    domElements.getImageHintBtn.disabled = false; // NEW: Reset image button state
    domElements.submitBtn.disabled = false; // Reset submit button state
    // Ensure loading is false when resetting
    gameState.isLoading = false;
    // Reset display fields
    domElements.wordDisplay.textContent = '_ '.repeat(5).trim(); // Show 5 underscores initially
    // NEW: No longer reset definitionElement, etc., as they are in endGameDetails and reset there
    // domElements.definitionElement.textContent = "Definition not available"; // REMOVED
    // domElements.grammaticalFeaturesElement.textContent = "Grammatical Features: Not specified"; // REMOVED
    // domElements.translationsElement.textContent = "Translations: Not available"; // REMOVED
    // domElements.pronunciationElement.textContent = "Pronunciation: Not available"; // REMOVED
    // domElements.imagesElement.textContent = "Images: No image available"; // REMOVED: This element is now in endGameDetails
    // domElements.lexicalCategoryElement.textContent = "Lexical Category: -"; // REMOVED: This element is now in endGameDetails
    // NEW: Hide end-game details initially
    domElements.endGameDetails.style.display = 'none';
    // NEW: Reset dynamic hint area to prompt
    domElements.dynamicHintArea.textContent = "Use hint buttons to reveal information.";
    // NEW: Clear revealed hints container
    domElements.revealedHintsContainer.innerHTML = ''; // Clear any previous hints
}

/**
 * Fetches a random lexeme data from Wikidata based on the selected language code and difficulty level.
 * Makes an actual SPARQL query to the Wikidata Query Service.
 * @param {string} languageCode - The language code (e.g., 'en', 'dag').
 * @param {string} difficultyLevel - The difficulty level (e.g., 'beginner', 'easy').
 */
async function fetchRandomWordFromWikidata(languageCode, difficultyLevel) {
    const qId = CONFIG.LANGUAGE_CODE_TO_QID[languageCode];
    if (!qId) {
        throw new Error(`Language code '${languageCode}' is not mapped to a Wikidata Q-ID in CONFIG.LANGUAGE_CODE_TO_QID.`);
    }

    const lengthRange = CONFIG.DIFFICULTY_LEVELS[difficultyLevel];
    if (!lengthRange) {
        throw new Error(`Difficulty level '${difficultyLevel}' is not defined in CONFIG.DIFFICULTY_LEVELS.`);
    }

    // Replace placeholders in the query template
    let query = CONFIG.SPARQL_QUERY_TEMPLATE
        .replace('LANG_PLACEHOLDER', `wd:${qId}`) // Insert the full Wikidata item URL
        .replace('LANG_CODE_PLACEHOLDER', languageCode)
        .replace('MIN_LENGTH_PLACEHOLDER', lengthRange.min.toString())
        .replace('MAX_LENGTH_PLACEHOLDER', lengthRange.max.toString());

    const url = `${CONFIG.API_BASE_URL}?query=${encodeURIComponent(query)}`;
    console.log("Fetching from Wiki", url); // For debugging

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/sparql-results+json'
        }
    });

    if (!response.ok) {
        throw new Error(`Wikidata API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const results = data.results.bindings;

    if (results.length === 0) {
        throw new Error(`No lexemes found for language '${languageCode}' with length between ${lengthRange.min} and ${lengthRange.max}.`);
    }

    // Group results by lexeme ID to handle multiple images/senses
    const lexemeMap = {};
    results.forEach(result => {
        const lexemeId = result.lexeme.value; // e.g., "http://www.wikidata.org/entity/L..."
        if (!lexemeMap[lexemeId]) {
            lexemeMap[lexemeId] = {
                lemma: result.lemma?.value?.toLowerCase() || "",
                definition: result.definition?.value || "Definition not available",
                grammaticalFeatures: result.grammaticalFeature?.value || "Not specified",
                translations: result.translation?.value || "Not available",
                pronunciation: result.pronunciation?.value || "Not available",
                images: [], // NEW: Initialize images array
                lexicalCategoryQid: result.lexicalCategory?.value || ""
            };
        }
        // Add image if present
        if (result.image) {
            lexemeMap[lexemeId].images.push(result.image.value); // NEW: Push image URL
        }
    });

    // Pick a random lexeme from the map
    const lexemeIds = Object.keys(lexemeMap);
    const randomLexemeId = lexemeIds[Math.floor(Math.random() * lexemeIds.length)];
    const lexemeData = lexemeMap[randomLexemeId];

    // Extract data from the grouped result
    gameState.currentLemma = lexemeData.lemma;
    gameState.currentWord = gameState.currentLemma; // Use lemma as the word to guess
    gameState.currentDefinition = lexemeData.definition;
    gameState.currentGrammaticalFeatures = lexemeData.grammaticalFeatures;
    gameState.currentTranslations = lexemeData.translations;
    gameState.currentPronunciation = lexemeData.pronunciation;
    gameState.currentImages = lexemeData.images; // NEW: Store the array of image URLs
    gameState.currentLexicalCategoryQid = lexemeData.lexicalCategoryQid;

    console.log("Fetched lexeme ", gameState); // For debugging
}


/**
 * Updates the display based on the current game state.
 */
function updateDisplay() {
    // Update word display
    if (gameState.isLoading) {
        // Show a loading message while fetching
        domElements.wordDisplay.textContent = "Loading...";
    } else if (!gameState.currentWord) {
        // Show underscores if no word is loaded yet and not loading
        domElements.wordDisplay.textContent = '_ '.repeat(5).trim(); // Show 5 underscores initially
    } else {
        // Show the word with letters revealed at specific indices (correctIndices)
        let displayWord = '';
        for (let i = 0; i < gameState.currentWord.length; i++) {
            // Check if this *index* has been revealed
            if (gameState.correctIndices.includes(i)) {
                displayWord += gameState.currentWord[i] + ' ';
            } else {
                displayWord += '_ ';
            }
        }
        domElements.wordDisplay.textContent = displayWord.trim();
    }

    // Update other display elements
    // NEW: Update the dynamic hint area to just show a prompt when no hints are active
    domElements.dynamicHintArea.textContent = "Use hint buttons to reveal information.";

    // NEW: Update the revealed hints container based on hint usage
    domElements.revealedHintsContainer.innerHTML = ''; // Clear previous hints

    if (gameState.hintUsage.definition > 0) {
        const hintDiv = document.createElement('div');
        hintDiv.textContent = `Definition: ${gameState.currentDefinition}`;
        domElements.revealedHintsContainer.appendChild(hintDiv);
    }
    if (gameState.hintUsage.grammaticalFeatures > 0) {
        const hintDiv = document.createElement('div');
        hintDiv.textContent = `Grammatical Features: ${gameState.currentGrammaticalFeatures}`;
        domElements.revealedHintsContainer.appendChild(hintDiv);
    }
    if (gameState.hintUsage.lexicalCategory > 0) {
        const hintDiv = document.createElement('div');
        hintDiv.textContent = `Lexical Category: ${gameState.currentLexicalCategoryLabel || gameState.currentLexicalCategoryQid}`;
        domElements.revealedHintsContainer.appendChild(hintDiv);
    }
    // NEW: Show images if the image hint was used
    if (gameState.hintUsage.image > 0 && gameState.currentImages.length > 0) {
        const imageHintDiv = document.createElement('div');
        imageHintDiv.textContent = 'Images:';
        domElements.revealedHintsContainer.appendChild(imageHintDiv);

        gameState.currentImages.forEach(imgUrl => {
            const imgElement = document.createElement('img');
            imgElement.src = imgUrl;
            imgElement.alt = "Hint Image";
            imgElement.style.maxWidth = '200px'; // Limit image size
            imgElement.style.display = 'block'; // Stack images vertically
            imgElement.style.margin = '5px 0';
            // Optionally, add a link to the original Commons file
            const linkElement = document.createElement('a');
            linkElement.href = imgUrl.replace('/images/', '/wiki/File:').replace(/\?.*/, ''); // Basic conversion to Commons file page URL
            linkElement.target = '_blank';
            linkElement.rel = 'noopener';
            linkElement.textContent = 'View Image on Commons'; // Link text
            linkElement.style.display = 'block'; // Make link appear below image
            linkElement.style.fontSize = '0.8em'; // Smaller link text
            linkElement.style.color = '#3498db'; // Link color

            domElements.revealedHintsContainer.appendChild(imgElement);
            domElements.revealedHintsContainer.appendChild(linkElement);
        });
    }
    // Add similar blocks for translations, pronunciation if needed

    domElements.languageDisplay.textContent = getLanguageName(gameState.currentLanguageCode);
    domElements.languageCodeDisplay.textContent = gameState.currentLanguageCode;
    domElements.livesElement.textContent = gameState.lives;
    domElements.scoreElement.textContent = gameState.score;
    domElements.gamesPlayedElement.textContent = gameState.gamesPlayed;
    domElements.gamesWonElement.textContent = gameState.gamesWon;

    const winRate = gameState.gamesPlayed > 0 ?
        Math.round((gameState.gamesWon / gameState.gamesPlayed) * 100) : 0;
    domElements.winRateElement.textContent = winRate + '%';
}

/**
 * Processes the player's guess.
 */
function processGuess() {
    if (!gameState.isGameActive || gameState.isLoading) return; // Prevent actions during loading or inactive game

    const guess = domElements.guessInput.value.trim().toLowerCase();
    if (!guess) return;

    // Check if it's a full word guess (Wordle style)
    if (guess.length === gameState.currentWord.length) {
        if (guess === gameState.currentWord) {
            // Player guessed the whole word correctly
            // NEW: Reveal all indices at once
            gameState.correctIndices = Array.from(gameState.currentWord, (char, index) => index);
            gameState.correctLetters = [...new Set(gameState.currentWord.split(''))]; // Add all unique letters
            gameState.score += CONFIG.POINTS_PER_WORD;
            endGame(true);
        } else {
            // Wrong word guess
            gameState.lives--;
            showFeedback(`Incorrect word guess! The word was "${gameState.currentWord}".`, false);
            if (gameState.lives <= 0) {
                endGame(false);
            }
        }
    } else {
        // Single letter guess (Hangman style - kept for potential hybrid)
        const letter = guess[0];
        if (gameState.guessedLetters.includes(letter)) {
            showFeedback(`You already guessed the letter '${letter}'!`, false);
            return;
        }

        gameState.guessedLetters.push(letter);

        if (gameState.currentWord.includes(letter)) {
            // Correct letter - find all indices of this letter in the word
            // NEW: Update correctIndices based on the letter guessed
            for (let i = 0; i < gameState.currentWord.length; i++) {
                if (gameState.currentWord[i] === letter && !gameState.correctIndices.includes(i)) {
                    gameState.correctIndices.push(i);
                }
            }

            // Add the letter to correctLetters for potential other uses
            if (!gameState.correctLetters.includes(letter)) {
                gameState.correctLetters.push(letter);
            }
            gameState.score += CONFIG.POINTS_PER_LETTER;
            showFeedback(`Good guess! '${letter}' is in the word.`, true);

            // Check if word is completely guessed (all indices revealed)
            // NEW: Check against correctIndices length
            if (gameState.correctIndices.length === gameState.currentWord.length) {
                // Word completed via letters
                gameState.score += CONFIG.POINTS_PER_WORD; // Bonus for completing via letters
                endGame(true);
            }
        } else {
            // Incorrect letter
            gameState.lives--;
            showFeedback(`Sorry, '${letter}' is not in the word.`, false);
            if (gameState.lives <= 0) {
                endGame(false);
            }
        }
    }

    domElements.guessInput.value = '';
    updateDisplay();
}

/**
 * Shows feedback message to the player.
 * @param {string} message - The message to display.
 * @param {boolean} isCorrect - Whether the message indicates a correct action.
 */
function showFeedback(message, isCorrect) {
    domElements.feedbackElement.textContent = message;
    domElements.feedbackElement.className = isCorrect ? 'feedback correct' : 'feedback incorrect';
}

/**
 * Ends the current game round.
 * @param {boolean} isWin - Whether the player won the round.
 */
function endGame(isWin) {
    gameState.isGameActive = false;
    domElements.guessInput.disabled = true;
    domElements.getDefinitionHintBtn.disabled = true; // Disable hint buttons
    domElements.getLetterHintBtn.disabled = true;
    domElements.getGrammaticalHintBtn.disabled = true;
    domElements.getLexicalCategoryHintBtn.disabled = true; // Disable lexical category hint button
    domElements.getImageHintBtn.disabled = true; // NEW: Disable image hint button
    domElements.submitBtn.disabled = true; // Disable submit button too

    if (isWin) {
        showFeedback(`Congratulations! You guessed the word "${gameState.currentWord}"!`, true);
        gameState.gamesWon++;
        gameState.score += gameState.lives * CONFIG.POINTS_BONUS_PER_LIFE; // Bonus for remaining lives
        // Show all hint details in the dedicated end-game section
        domElements.endGameDetails.style.display = 'block'; // Show the details container
        // Get elements inside endGameDetails dynamically
        const definitionEl = domElements.endGameDetails.querySelector('#definition');
        const grammaticalFeaturesEl = domElements.endGameDetails.querySelector('#grammaticalFeatures');
        const lexicalCategoryEl = domElements.endGameDetails.querySelector('#lexicalCategory');
        const translationsEl = domElements.endGameDetails.querySelector('#translations');
        const pronunciationEl = domElements.endGameDetails.querySelector('#pronunciation');
        const imagesEl = domElements.endGameDetails.querySelector('#images'); // NEW: Get images element

        if (definitionEl) definitionEl.textContent = `Definition: ${gameState.currentDefinition}`;
        if (grammaticalFeaturesEl) grammaticalFeaturesEl.textContent = `Grammatical Features: ${gameState.currentGrammaticalFeatures}`;
        if (lexicalCategoryEl) lexicalCategoryEl.textContent = `Lexical Category: ${gameState.currentLexicalCategoryLabel || gameState.currentLexicalCategoryQid}`;
        if (translationsEl) translationsEl.textContent = `Translations: ${gameState.currentTranslations}`;
        if (pronunciationEl) pronunciationEl.textContent = `Pronunciation: ${gameState.currentPronunciation}`;
        if (imagesEl) {
            // NEW: Set image content in end-game details
            if (gameState.currentImages.length > 0) {
                imagesEl.innerHTML = 'Images:<br>'; // Clear and add header
                gameState.currentImages.forEach(imgUrl => {
                    const imgElement = document.createElement('img');
                    imgElement.src = imgUrl;
                    imgElement.alt = "End Game Image";
                    imgElement.style.maxWidth = '150px'; // Smaller size for end-game
                    imgElement.style.display = 'block';
                    imgElement.style.margin = '5px 0';
                    // Add link to Commons
                    const linkElement = document.createElement('a');
                    linkElement.href = imgUrl.replace('/images/', '/wiki/File:').replace(/\?.*/, '');
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener';
                    linkElement.textContent = 'View on Commons';

                    imagesEl.appendChild(imgElement);
                    imagesEl.appendChild(linkElement);
                    imagesEl.appendChild(document.createElement('br')); // Line break after each image/link pair
                });
            } else {
                imagesEl.textContent = 'Images: No image available';
            }
        }
    } else {
        showFeedback(`Game over! The word was "${gameState.currentWord}".`, false);
        // Show all hint details in the dedicated end-game section on loss as well
        domElements.endGameDetails.style.display = 'block'; // Show the details container
        // Get elements inside endGameDetails dynamically
        const definitionEl = domElements.endGameDetails.querySelector('#definition');
        const grammaticalFeaturesEl = domElements.endGameDetails.querySelector('#grammaticalFeatures');
        const lexicalCategoryEl = domElements.endGameDetails.querySelector('#lexicalCategory');
        const translationsEl = domElements.endGameDetails.querySelector('#translations');
        const pronunciationEl = domElements.endGameDetails.querySelector('#pronunciation');
        const imagesEl = domElements.endGameDetails.querySelector('#images'); // NEW: Get images element

        if (definitionEl) definitionEl.textContent = `Definition: ${gameState.currentDefinition}`;
        if (grammaticalFeaturesEl) grammaticalFeaturesEl.textContent = `Grammatical Features: ${gameState.currentGrammaticalFeatures}`;
        if (lexicalCategoryEl) lexicalCategoryEl.textContent = `Lexical Category: ${gameState.currentLexicalCategoryLabel || gameState.currentLexicalCategoryQid}`;
        if (translationsEl) translationsEl.textContent = `Translations: ${gameState.currentTranslations}`;
        if (pronunciationEl) pronunciationEl.textContent = `Pronunciation: ${gameState.currentPronunciation}`;
        if (imagesEl) {
            // NEW: Set image content in end-game details
            if (gameState.currentImages.length > 0) {
                imagesEl.innerHTML = 'Images:<br>'; // Clear and add header
                gameState.currentImages.forEach(imgUrl => {
                    const imgElement = document.createElement('img');
                    imgElement.src = imgUrl;
                    imgElement.alt = "End Game Image";
                    imgElement.style.maxWidth = '150px'; // Smaller size for end-game
                    imgElement.style.display = 'block';
                    imgElement.style.margin = '5px 0';
                    // Add link to Commons
                    const linkElement = document.createElement('a');
                    linkElement.href = imgUrl.replace('/images/', '/wiki/File:').replace(/\?.*/, '');
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener';
                    linkElement.textContent = 'View on Commons';

                    imagesEl.appendChild(imgElement);
                    imagesEl.appendChild(linkElement);
                    imagesEl.appendChild(document.createElement('br')); // Line break after each image/link pair
                });
            } else {
                imagesEl.textContent = 'Images: No image available';
            }
        }
    }

    gameState.gamesPlayed++;
    updateDisplay();
}

/**
 * NEW: Provides a Definition hint.
 */
function getDefinitionHint() {
    if (!gameState.isGameActive || gameState.isLoading) return;
    if (gameState.hintUsage.definition > 0) { // NEW: Prevent multiple uses of the same hint type
        showFeedback("Definition hint already used!", false);
        return;
    }

    // Deduct points
    gameState.score += CONFIG.HINT_COSTS.definition; // Add negative points (i.e., subtract)
    // Mark hint as used
    gameState.hintUsage.definition++;

    showFeedback(`Definition revealed! ${Math.abs(CONFIG.HINT_COSTS.definition)} points deducted.`, false);
    updateDisplay(); // Update display to show the definition in the revealed hints section
}

/**
 * NEW: Provides a Letter hint. Reveals only one instance of a letter at a time.
 * Prioritizes revealing positions that were not guessed by the player.
 */
function getLetterHint() {
    if (!gameState.isGameActive || gameState.isLoading) return;

    // Find *positions* of letters that are in the word but not yet in correctIndices
    const unguessedLetterIndices = [];
    for (let i = 0; i < gameState.currentWord.length; i++) {
        // Check if this *index* is already revealed
        if (!gameState.correctIndices.includes(i)) {
            unguessedLetterIndices.push(i);
        }
    }

    if (unguessedLetterIndices.length === 0) {
        showFeedback("No more letters to reveal!", false);
        return;
    }

    // Pick a random *index* from the unguessed ones
    const randomIndex = unguessedLetterIndices[Math.floor(Math.random() * unguessedLetterIndices.length)];
    const randomLetter = gameState.currentWord[randomIndex]; // Get the letter at that index

    // NEW: Add the *index* to correctIndices to reveal this specific position
    gameState.correctIndices.push(randomIndex);
    // Also add the letter to guessedLetters to prevent duplicate hint requests for the same letter
    // We don't add it to correctLetters here, as correctIndices handles the display now
    if (!gameState.guessedLetters.includes(randomLetter)) {
        gameState.guessedLetters.push(randomLetter);
    }

    // NEW: Increment letter hint usage if tracking that way
    gameState.hintUsage.letter++;

    // Deduct points
    gameState.score += CONFIG.HINT_COSTS.letter; // Add negative points (i.e., subtract)

    showFeedback(`Letter '${randomLetter}' revealed! ${Math.abs(CONFIG.HINT_COSTS.letter)} points deducted.`, false);
    updateDisplay(); // Update display to show the new letter at the specific index
}

/**
 * NEW: Provides a Grammatical Feature hint.
 */
function getGrammaticalHint() {
    if (!gameState.isGameActive || gameState.isLoading) return;
    if (gameState.hintUsage.grammaticalFeatures > 0) { // NEW: Prevent multiple uses of the same hint type
        showFeedback("Grammatical feature hint already used!", false);
        return;
    }

    // Deduct points
    gameState.score += CONFIG.HINT_COSTS.grammaticalFeatures; // Add negative points (i.e., subtract)
    // Mark hint as used
    gameState.hintUsage.grammaticalFeatures++;

    showFeedback(`Grammatical feature revealed! ${Math.abs(CONFIG.HINT_COSTS.grammaticalFeatures)} points deducted.`, false);
    updateDisplay(); // Update display to show the grammatical feature in the revealed hints section
}

/**
 * NEW: Provides an Image hint. Shows all images associated with the lexeme.
 */
function getImageHint() {
    if (!gameState.isGameActive || gameState.isLoading) return;
    if (gameState.hintUsage.image > 0) { // Prevent multiple uses of the same hint type
        showFeedback("Image hint already used!", false);
        return;
    }

    if (gameState.currentImages.length === 0) {
         showFeedback("No images available for this word.", false);
         return;
    }

    // Deduct points
    gameState.score += CONFIG.HINT_COSTS.image; // Add negative points (i.e., subtract)
    // Mark hint as used
    gameState.hintUsage.image++;

    showFeedback(`Image(s) revealed! ${Math.abs(CONFIG.HINT_COSTS.image)} points deducted.`, false);
    updateDisplay(); // Update display to show the image(s) in the revealed hints section
}

/**
 * NEW: Fetches the label for a Wikidata Q-ID using the MediaWiki API.
 * @param {string} qid - The Wikidata Q-ID (e.g., "Q1084").
 * @returns {Promise<string>} The label (e.g., "noun") or the Q-ID if label not found.
 */
async function fetchLabelForQid(qid) {
    // Example API call: https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1084&props=labels&languages=en&format=json
    // Extract the number part from the Q-ID (e.g., "Q1084" -> "1084")
    const qNumber = qid.split('/').pop(); // Gets the last part after splitting by '/'
    if (!qNumber || !qNumber.startsWith('Q')) {
        console.error(`Invalid Q-ID format: ${qid}`);
        return qid; // Return the original Q-ID if it's malformed
    }

    const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: qNumber,
        props: 'labels',
        languages: 'en', // You could make this dynamic based on gameState.currentLanguageCode if needed
        format: 'json',
        origin: '*' // For CORS
    });

    const url = `${CONFIG.LABEL_API_URL}?${params}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Label API request failed with status ${response.status}`);
        }
        const data = await response.json();
        // Navigate the response structure: data.entities[QNumber].labels.en.value
        const label = data.entities?.[qNumber]?.labels?.en?.value;
        return label || qid; // Return the label if found, otherwise return the Q-ID
    } catch (error) {
        console.error(`Error fetching label for ${qid}:`, error);
        return qid; // Return the Q-ID if fetching fails
    }
}


/**
 * NEW: Provides a Lexical Category hint.
 */
async function getLexicalCategoryHint() {
    if (!gameState.isGameActive || gameState.isLoading) return;
    if (gameState.hintUsage.lexicalCategory > 0) { // NEW: Prevent multiple uses of the same hint type
        showFeedback("Lexical category hint already used!", false);
        return;
    }

    // NEW: Check if we have the Q-ID, if not, hint is not available
    if (!gameState.currentLexicalCategoryQid) {
         showFeedback("Lexical category information not available for this word.", false);
         return;
    }

    // NEW: Fetch the label for the Q-ID
    gameState.currentLexicalCategoryLabel = await fetchLabelForQid(gameState.currentLexicalCategoryQid);

    // Deduct points
    gameState.score += CONFIG.HINT_COSTS.lexicalCategory; // Add negative points (i.e., subtract)
    // Mark hint as used
    gameState.hintUsage.lexicalCategory++;

    showFeedback(`Lexical category revealed: ${gameState.currentLexicalCategoryLabel || gameState.currentLexicalCategoryQid}! ${Math.abs(CONFIG.HINT_COSTS.lexicalCategory)} points deducted.`, false);
    updateDisplay(); // Update display to show the lexical category in the revealed hints section
}


/**
 * Gets the display name for a language code.
 * @param {string} code - The language code.
 * @returns {string} The language name.
 */
function getLanguageName(code) {
    const languageNames = {
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "dag": "Dagbani"
        // Add more mappings as needed
    };
    return languageNames[code] || code.toUpperCase();
}

// --- 5. EVENT LISTENERS ---
// Attach event listeners to buttons and input
// Ensure domElements.submitBtn exists before adding listener
if (domElements.submitBtn) {
    domElements.submitBtn.addEventListener('click', processGuess);
} else {
    console.error("submitBtn element not found in DOM!");
}

// Replace single hint button listener with individual hint button listeners
if (domElements.getDefinitionHintBtn) domElements.getDefinitionHintBtn.addEventListener('click', getDefinitionHint);
if (domElements.getLetterHintBtn) domElements.getLetterHintBtn.addEventListener('click', getLetterHint);
if (domElements.getGrammaticalHintBtn) domElements.getGrammaticalHintBtn.addEventListener('click', getGrammaticalHint);
// Add event listener for lexical category hint (must be async)
if (domElements.getLexicalCategoryHintBtn) domElements.getLexicalCategoryHintBtn.addEventListener('click', getLexicalCategoryHint);
// NEW: Add event listener for image hint
if (domElements.getImageHintBtn) domElements.getImageHintBtn.addEventListener('click', getImageHint);
if (domElements.newGameBtn) domElements.newGameBtn.addEventListener('click', () => {
     // Update language code based on selection before starting new game
    gameState.currentLanguageCode = domElements.languageSelect.value;
    gameState.currentLanguageName = getLanguageName(gameState.currentLanguageCode);
    // The difficulty is now handled inside initGame via domElements.difficultySelect.value
    initGame(); // Call initGame to fetch new word using language and difficulty
});

// NEW: Add event listeners for the How To Play and About buttons
function setupInfoToggle(buttonElement, contentElement) {
    if (buttonElement && contentElement) { // NEW: Check if elements exist
        buttonElement.addEventListener('click', () => {
            const isHidden = contentElement.classList.contains('hidden');
            contentElement.classList.toggle('hidden');
            buttonElement.classList.toggle('active', !isHidden); // Toggle active class for styling
        });
    } else {
        console.warn(`Info toggle elements not found: ${buttonElement?.id || 'button'} / ${contentElement?.id || 'content'}`);
    }
}

setupInfoToggle(domElements.howToPlayBtn, domElements.howToPlayContent);
setupInfoToggle(domElements.aboutBtn, domElements.aboutContent);

if (domElements.guessInput) {
    domElements.guessInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            processGuess();
        }
    });
} else {
    console.error("guessInput element not found in DOM!");
}

// --- 6. INITIALIZATION ---
// Initialize the game when the page loads
window.onload = () => {
    // Set initial language from the selector
    gameState.currentLanguageCode = domElements.languageSelect.value;
    gameState.currentLanguageName = getLanguageName(gameState.currentLanguageCode);
    // NEW: Set initial difficulty from the selector
    gameState.currentDifficulty = domElements.difficultySelect.value;
    // NEW: Ensure initial state is not loading and update display
    gameState.isLoading = false;
    // Update display to show initial language and setup
    updateDisplay();
    // NEW: Call initGame to start the first game automatically after page loads
    initGame();
};
