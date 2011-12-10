/*
*  Mobile-style interaction front-end for JSZhuying
*
*/

'use stricts';

if (!JSZhuYing) {
  console.log('JSZhuYing: front-end script should load *after* the main script.');
  var JSZhuYing = {};
}

JSZhuYing.Mobi = function (settings) {
  /* const */var symbolType = {
    "ㄅ":"consonant","ㄆ":"consonant","ㄇ":"consonant","ㄈ":"consonant","ㄉ":"consonant","ㄊ":"consonant","ㄋ":"consonant","ㄌ":"consonant","ㄍ":"consonant","ㄎ":"consonant","ㄏ":"consonant","ㄐ":"consonant","ㄑ":"consonant","ㄒ":"consonant","ㄓ":"consonant","ㄔ":"consonant","ㄕ":"consonant","ㄖ":"consonant","ㄗ":"consonant","ㄘ":"consonant","ㄙ":"consonant",
    "ㄧ":"vowel1","ㄨ":"vowel1","ㄩ":"vowel1",
    "ㄚ":"vowel2","ㄛ":"vowel2","ㄜ":"vowel2","ㄝ":"vowel2","ㄞ":"vowel2","ㄟ":"vowel2","ㄠ":"vowel2","ㄡ":"vowel2","ㄢ":"vowel2","ㄣ":"vowel2","ㄤ":"vowel2","ㄥ":"vowel2","ㄦ":"vowel2",
    " ":"tone","˙":"tone","ˊ":"tone","ˇ":"tone","ˋ":"tone"
  },
  symbolPlace = {
    "consonant":0,
    "vowel1":1,
    "vowel2":2,
    "tone":3
  },
  getChoices = function (syllables, type, callback) {
    var choices = [];
    switch (type) {
      case 'sentence':
        jszhuying.getSentences(
          syllables,
          function (sentences) {
            if (!sentences) return callback([]);
            sentences.forEach(
              function (sentence) {
                var str = '';
                sentence.forEach(
                  function (term) {
                    str += term[0];
                  }
                );
                if (choices.indexOf(str) === -1) choices.push(str);
              }
            );
            callback(choices);
          }
        );
      break;
      case 'term':
        jszhuying.getTerms(
          syllables,
          function (terms) {
            if (!terms) return callback([]);
            terms.forEach(
              function (term) {
                choices.push(term[0]);
              }
            );
            callback(choices);
          }
        );
      break;
    }
  },
  queue = function (code) {
    keypressQueue.push(code);
    if (!isWorking) {
      isWorking = true;
      next();
    }
  },
  select = function (text) {
    settings.sendString(text);
    var i = text.length;
    while (i--) {
      syllablesInBuffer.shift();
    }
    if (!syllablesInBuffer.length) {
      syllablesInBuffer = [''];
      pendingSyllable = ['','','',''];
    }
    findChoices(function () {});
  },
  next = function () {
    if (!keypressQueue.length) {
      isWorking = false;
      return;
    }
    keypressed(
      keypressQueue.shift(),
      next
    );
  },
  findChoices = function (callback) {
    var allChoices = [];
    if (!syllablesInBuffer.join('').length) {
      settings.sendChoices(allChoices);
      return callback();
    }
    getChoices(
      syllablesInBuffer,
      'term',
      function (choices) {
        choices.forEach(
          function (choice) {
            allChoices.push([choice, 'whole']);
          }
        );
        if (syllablesInBuffer.length === 1 && allChoices.length) {
          settings.sendChoices(allChoices);
          return callback();
        } else if (syllablesInBuffer.length === 1) {
          allChoices.push([syllablesInBuffer.join(''), 'whole']);
          settings.sendChoices(allChoices);
          return callback();
        }
        getChoices(
          syllablesInBuffer,
          'sentence',
          function (choices) {
            choices.forEach(
              function (choice) {
                if (!allChoices.some(
                  function (availChoice) {
                    return (availChoice[0] === choice);
                  }
                )) {
                  allChoices.push([choice, 'whole']);
                }
              }
            );

            if (!allChoices.length) allChoices.push([syllablesInBuffer.join(''), 'whole']);

            var i = Math.min(8, syllablesInBuffer.length - 1),
            findTerms = function () {
              getChoices(
                syllablesInBuffer.slice(0, i),
                'term',
                function (choices) {
                  choices.forEach(
                    function (choice) {
                      allChoices.push([choice, 'term']);
                    }
                  );
                  i--;
                  if (i) findTerms();
                  else {
                    settings.sendChoices(allChoices);
                    return callback();
                  }
                }
              );
            };
            findTerms();
          }
        );
      }
    );
  },
  getFirstChoice = function (callback) {
    getChoices(
      syllablesInBuffer,
      'term',
      function (choices) {
        if (choices[0]) return callback(choices[0]);
        getChoices(
          syllablesInBuffer,
          'sentence',
          function (choices) {
            if (choices[0]) return callback(choices[0]);
            else return callback(syllablesInBuffer.join(''));
          }
        );
      }
    );
  },
  keypressed = function (code, callback) {
    if (code === 13) { // enter
      if (
        syllablesInBuffer.length === 1
        && syllablesInBuffer[0] === ''
      ) {
        settings.sendKey(13); // default action
        return callback();
      }
      getFirstChoice(
        function (sentense) {
          settings.sendString(sentense);
          settings.sendChoices([]);
          syllablesInBuffer = [''];
          pendingSyllable = ['','','',''];
          return callback();
        }
      );
      return;
    }

    if (code === 8) { // backspace
      if (
        syllablesInBuffer.length === 1
        && syllablesInBuffer[0] === ''
      ) {
        settings.sendKey(8); // default action
        return callback();
      }
      if (
        !pendingSyllable.some(function (s) { return !!s; })
      ) {
        syllablesInBuffer = syllablesInBuffer.slice(0, syllablesInBuffer.length-1);
        syllablesInBuffer[syllablesInBuffer.length-1] = pendingSyllable.join('');
        return findChoices(callback);
      }
      pendingSyllable = ['','','',''];
      syllablesInBuffer[syllablesInBuffer.length-1] = pendingSyllable.join('');
      return findChoices(callback);
    }

    var symbol = String.fromCharCode(code);
    if (!symbolType[symbol]) return callback();

    if (symbol !== " ") pendingSyllable[symbolPlace[symbolType[symbol]]] = symbol;

    syllablesInBuffer[syllablesInBuffer.length-1] = pendingSyllable.join('');

    findChoices(
      function () {
        if (symbolType[symbol] === 'tone') {
          // start syllables for next character
          syllablesInBuffer.push('');
          pendingSyllable = ['','','',''];
        }
        callback();
      }
    );
  };

  var syllablesInBuffer = [''],
  pendingSyllable = ['','','',''],
  keypressQueue = [],
  isWorking = false;

  return {
    keypress: queue,
    select: select
  }

};

