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

	var version = '0.1',
	tsi,
	init = function () {
		// Get tsi.json.js
		// this is the database we need to get terms against.
		// the JSON is converted from tsi.src in Chewing source code.
		// https://github.com/chewing/libchewing/blob/master/data/tsi.src

		var xhr = new XMLHttpRequest();
		xhr.open(
			'GET',
			settings.tsi || './tsi.json.js',
			true
		);
		xhr.onreadystatechange = function (ev) {
			if (xhr.readyState !== 4) return;
			try {
				tsi = JSON.parse(xhr.responseText);
			} catch (e) {}
			if (!tsi) {
				console.log('JSZhuYing: tsi.json.js failed to load.');
			}
			if (typeof settings.ready === 'function') settings.ready.call(this);
			
			xhr.responseText = null;
			delete xhr;
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
	getSentences = function (syllables) {
		var sentences = [];
		compositionsOf.call(
			this,
			syllables.length,
			function (compositions) {
				var str = [], score = 0, start = 0;
				compositions.some(
					function (length) {
						var term = getTermWithHighestScore(syllables.slice(start, start + length));
						if (!term) return true; // cause some() to stop
						str.push(term);
						start += length;
						return false;
					}
				);
				if (start !== syllables.length) return; // incomplete; this composition doesn't made up any sentences
				sentences.push(str);
			}
		);
		return sentences;
	},
	/*
	* With series of syllables, return the sentence with highest score
	*
	*/
	getSentenceWithHighestScore = function (syllables) {
		var sentences = getSentences(syllables), theSentence, theScore = -1;
		if (!sentences) return false;
		sentences.forEach(
			function (sentence) {
				var score = 0;
				sentence.forEach(
					function (term) {
						if (term.t.length === 1) score += term.s / 512; // magic number from rule_largest_freqsum() in libchewing/src/tree.c
						else score += term.s;
					}
				);
				if (score >= theScore) {
					theSentence = sentence;
					theScore = score;
				}
			}
		);
		return theSentence;
	},
	/*
	* Simple query function that works with tsi.json.js, return an array of objects representing all possible terms 
	*
	*/
	getTerms = function (syllables) {
		if (!tsi) {
			console.log('JSZhuYing: database not ready.');
			return false;
		}
		return tsi[syllables.join('')] || false;
	},
	/*
	* Return the term with the highest score
	*
	*/
	getTermWithHighestScore = function (syllables) {
		var terms = getTerms(syllables), theTerm = {s: -1, t: ''};
		if (!terms) return false;
		terms.forEach(
			function (term) {
				if (term.s > theTerm.s) {
					theTerm = term;
				}
			}
		);
		if (theTerm.s !== -1) return theTerm;
		else return false;
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