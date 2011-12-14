/*
*  JSZhuYing (潔司注音)
*  An auto-selection IME for Chinese (possibility Japanese and Korean)
*
*  Author: timdream <timdream@gmail.com>, http://timc.idv.tw/
*
*  Part of Mozilla B2G project.
*
*/

'use stricts';

var JSZhuYing = function (settings) {

  settings = settings || {};
  if (typeof settings.progress !== 'function') settings.progress = function () {};
  if (typeof settings.ready !== 'function') settings.ready = function () {};

  var version = '0.1',
  jsonData,
  cache = {},
  cacheTimer,
  db,
  init = function () {
    var that = this;
    if (settings.disableIndexedDB) {
      settings.progress.call(that, 'IndexedDB disabled; Downloading JSON ...');
      getTermsJSON(
        function () {
          settings.ready.call(that);
        }
      );
      return;
    }
    getTermsInDB(
      function () {
        if (!db) {
          settings.progress.call(that, 'IndexedDB not available; Downloading JSON ...');
          getTermsJSON(
            function () {
              settings.ready.call(that);
            }
          );
          return;
        }

        var transaction = db.transaction('terms'),
        req = transaction.objectStore('terms').count();
        req.onsuccess = function (ev) {
          if (req.result === 0) {
            settings.progress.call(that, 'IndexedDB is supported but empty or need upgrade; Downloading JSON ...');
            getTermsJSON(
              function () {
                if (!jsonData) return;
                var transaction = db.transaction('terms', IDBTransaction.READ_WRITE),
                store = transaction.objectStore('terms');

                transaction.oncomplete = function () {
                  settings.ready.call(that);
                };

                for (syllables in jsonData) {
                  store.add(
                    {
                      syllables: syllables,
                      terms: jsonData[syllables]
                    }
                  );
                }
                jsonData = null;
                delete jsonData;
              }
            );
            return;
          }
          // db is ready
          //settings.progress.call(that, 'IndexedDB loaded: ' + req.result.toString(10) + ' entries.');
          settings.ready.call(that);
        };
      }
    );
  },
  getTermsInDB = function (callback) {
    if (!window.mozIndexedDB || window.location.protocol === 'file:') {
      callback();
      return;
    }
    var req = mozIndexedDB.open('JSZhuYing', 4, 'JSZhuYing db');
    req.onerror = function () {
      console.log('JSZhuYing: there is a problem with the database.');
      callback();
    };
    req.onupgradeneeded = function (ev) {
      //console.log('upgradeneeded; get db', req, req.result);
      db = req.result;
      if (db.objectStoreNames.length !== 0) db.deleteObjectStore('terms');
      var store = db.createObjectStore(
        'terms',
        {
          keyPath: 'syllables'
        }
      );
    };
    req.onsuccess = function () {
      //console.log('success');
      db = req.result;
      callback();
    };
  },
  getTermsJSON = function (callback) {
    // Get data.json.js
    // this is the database we need to get terms against.
    // the JSON is converted from tsi.src and phone.cin in Chewing source code.
    // https://github.com/chewing/libchewing/blob/master/data/tsi.src
    // https://github.com/chewing/libchewing/blob/master/data/phone.cin

    var xhr = new XMLHttpRequest();
    xhr.open(
      'GET',
      settings.data || './data.json.js',
      true
    );
    xhr.onreadystatechange = function (ev) {
      if (xhr.readyState !== 4) return;
      try {
        jsonData = JSON.parse(xhr.responseText);
      } catch (e) {}
      if (!jsonData) {
        console.log('JSZhuYing: data.json.js failed to load.');
      }
      xhr.responseText = null;
      delete xhr;

      callback();
    };
    xhr.send(null);

  },
  /*
  * Math function that return all possibile compositions of a given natural number
  * callback will be called 2^(n-1) times.
  *
  * ref: http://en.wikipedia.org/wiki/Composition_(number_theory)#Examples
  * also: http://stackoverflow.com/questions/8375439
  */
  compositionsOf = function (n, callback) {
    var x, a, j;
    x = 1 << n-1;
    while (x--) {
      a = [1];
      j = 0;
      while (n-1 > j) {
        if (x & (1 << j)) {
          a[a.length-1]++;
        } else {
          a.push(1);
        }
        j++;
      }
      callback.call(this, a);
    }
  },
  /*
  * With series of syllables, return an array of possible sentences
  *
  */
  getSentences = function (syllables, callback) {
    var sentences = [], n = 0;
    compositionsOf.call(
      this,
      syllables.length,
      /* This callback will be called 2^(n-1) times */
      function (composition) {
        var str = [], score = 0, start = 0, i = 0,
        next = function () {
          var numOfWord = composition[i];
          if (composition.length === i) return finish();
          i++;
          getTermWithHighestScore(
            syllables.slice(start, start + numOfWord),
            function (term) {
              if (!term) return finish();
              str.push(term);
              start += numOfWord;
              next();
            }
          );
        },
        finish = function () {
          if (start === syllables.length) sentences.push(str); // complete; this composition does made up a sentence
          n++;
          if (n === (1 << (syllables.length - 1))) {
            cleanCache();
            callback(sentences);
          }
        };
        next();
      }
    );
  },
  /*
  * With series of syllables, return the sentence with highest score
  *
  */
  getSentenceWithHighestScore = function (syllables, callback) {
    var theSentence, theScore = -1;
    return getSentences(
      syllables,
      function (sentences) {
        if (!sentences) return callback(false);
        sentences.forEach(
          function (sentence) {
            var score = 0;
            sentence.forEach(
              function (term) {
                if (term[0].length === 1) score += term[1] / 512; // magic number from rule_largest_freqsum() in libchewing/src/tree.c
                else score += term[1];
              }
            );
            if (score >= theScore) {
              theSentence = sentence;
              theScore = score;
            }
          }
        );
        return callback(theSentence);
      }
    );

  },
  /*
  * Simple query function that return an array of objects representing all possible terms
  *
  */
  getTerms = function (syllables, callback) {
    if (!jsonData && !db) {
      console.log('JSZhuYing: database not ready.');
      return callback(false);
    }
    if (db) {
      if (typeof cache[syllables.join('')] !== 'undefined') return callback(cache[syllables.join('')]);
      var req = db.transaction('terms'/*, IDBTransaction.READ_ONLY */).objectStore('terms').get(syllables.join(''));
      return req.onsuccess = function (ev) {
        cleanCache();
        if (ev.target.result) {
          cache[syllables.join('')] = ev.target.result.terms;
          return callback(ev.target.result.terms);
        } else {
          cache[syllables.join('')] = false;
          return callback(false);
        }
      };
    }
    return callback(jsonData[syllables.join('')] || false);
  },
  /*
  * Return the term with the highest score
  *
  */
  getTermWithHighestScore = function (syllables, callback) {
    return getTerms(
      syllables,
      function (terms) {
        var theTerm = ['', -1];
        if (!terms) return callback(false);
        terms.forEach(
          function (term) {
            if (term[1] > theTerm[1]) {
              theTerm = term;
            }
          }
        );
        if (theTerm[1] !== -1) return callback(theTerm);
        else return callback(false);
      }
    );
  },
  cleanCache = function () {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(
      function () {
        cache = {};
      },
      4000
    );
  };

  init.call(this);

  return {
    version: version,
    getSentences: getSentences,
    getSentenceWithHighestScore: getSentenceWithHighestScore,
    getTerms: getTerms,
    getTermWithHighestScore: getTermWithHighestScore
  };
};
