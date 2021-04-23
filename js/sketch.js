
const serverPath = 'http://files.lauren-mccarthy.com/what-to-say/';

function RequestAuthorizationToken() {
  let a = new XMLHttpRequest();
  a.open("GET", serverPath + 'token.php');
  a.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  a.send("");
  a.onload = function() {
    let token = JSON.parse(atob(this.responseText.split(".")[1]));
    authorizationRegion = token.region;
    authorizationToken = this.responseText;
    console.log("Got an authorization token: " + token);
    updateVoiceList();
    updateInput();
  }
}

// Speech SDK USAGE
let authorizationToken, authorizationRegion;
let voiceOption;
let SpeechSDK;
let synthesisText;
let synthesizer;
let player;
let wordBoundaryList = [];
let asking = true;

// SPEECH SYNTHESIS
let startSynthesisAsyncButton;

function updateVoiceList() {
  let request = new XMLHttpRequest();
  request.open('GET',
          'https://westus.tts.speech.microsoft.com/cognitiveservices/voices/list', true);
  if (authorizationToken) {
    request.setRequestHeader("Authorization", "Bearer " + authorizationToken);
  }

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      const response = this.response;
      const neuralSupport = (response.indexOf("AriaNeural") > 0);
      const defaultVoice = neuralSupport ? "AriaNeural" : "AriaRUS";

      const data = JSON.parse(response);
      console.log(data);
      voiceOption = defaultVoice.Name;
    } else {
      window.console.log(this);
    }
    synthesizeSpeech("What do you want me to say?");
    asking = true;

  };
  request.send();
}


function synthesizeSpeech(synthesisText) {
  phraseSpan.html(`<span>${synthesisText}</span>`);
  wordBoundaryList = [];

  let speechConfig;
  if (authorizationToken) {
    speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(authorizationToken, authorizationRegion);
  }

  speechConfig.speechSynthesisVoiceName = voiceOption;
  speechConfig.speechSynthesisOutputFormat = 'Audio24Khz48KBitRateMonoMp3';

  player = new SpeechSDK.SpeakerAudioDestination();
  player.onAudioEnd = function (_) {
    window.console.log("playback finished");
    wordBoundaryList = [];
    if (asking) {
      doRecognizeOnceAsync();
      asking = false;
    } else {
      synthesizeSpeech("What do you want me to say?");
      asking = true;
    }
  };

  let audioConfig  = SpeechSDK.AudioConfig.fromSpeakerOutput(player);

  synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);
  synthesizer.synthesizing = function (s, e) {};
  synthesizer.synthesisStarted = function (s, e) {};
  synthesizer.synthesisCompleted = function (s, e) {};

  // The event signals that the service has stopped processing speech.
  // This can happen when an error is encountered.
  synthesizer.SynthesisCanceled = function (s, e) {
    const cancellationDetails = SpeechSDK.CancellationDetails.fromResult(e.result);
    let str = "(cancel) Reason: " + SpeechSDK.CancellationReason[cancellationDetails.reason];
    if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
      str += ": " + e.result.errorDetails;
    }
    window.console.log(e);
  };

  // This event signals that word boundary is received. This indicates the audio boundary of each word.
  // The unit of e.audioOffset is tick (1 tick = 100 nanoseconds), divide by 10,000 to convert to milliseconds.
  synthesizer.wordBoundary = function (s, e) {
    wordBoundaryList.push(e);
  };

  const complete_cb = function (result) {
    if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
    } else if (result.reason === SpeechSDK.ResultReason.Canceled) {
    }
    window.console.log(result);
    synthesizer.close();
    synthesizer = undefined;
  };
  const err_cb = function (err) {
    window.console.log(err);
    synthesizer.close();
    synthesizer = undefined;
  };
  synthesizer.speakTextAsync(synthesisText,
    complete_cb,
    err_cb);
};

// SPEECH RECOGNITION
let reco;
let soundContext = undefined;

try {
  let AudioContext = window.AudioContext // our preferred impl
    || window.webkitAudioContext       // fallback, mostly when on Safari
    || false;                          // could not find.

  if (AudioContext) {
    soundContext = new AudioContext();
  } else {
    alert("Audio context not supported");
  }
} catch (e) {
  window.console.log("no sound context found, no audio output. " + e);
}

function updateInput() {
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(authorizationToken, authorizationRegion);
  speechConfig.speechRecognitionLanguage = 'en-US';

  reco = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  reco.recognizing = onRecognizing;
  reco.canceled = onCanceled;
  reco.sessionStarted = onSessionStarted;
  reco.sessionStopped = onSessionStopped;
}

function onRecognizing(sender, recognitionEventArgs) {
}

function onRecognizedResult(result) {
  switch (result.reason) {
    case SpeechSDK.ResultReason.NoMatch:
    case SpeechSDK.ResultReason.Canceled:
      let noMatchDetail = SpeechSDK.NoMatchDetails.fromResult(result);
      synthesizeSpeech("Sorry, I didn't get that.");
      break;
    case SpeechSDK.ResultReason.RecognizedSpeech:
    case SpeechSDK.ResultReason.RecognizedIntent:
      let intentJson = result.properties
          .getProperty(SpeechSDK.PropertyId.LanguageUnderstandingServiceResponse_JsonResult);
      synthesizeSpeech(result.text);
      break;
  }
}

function onSessionStarted(sender, sessionEventArgs) {
}

function onSessionStopped(sender, sessionEventArgs) {
}

function onCanceled (sender, cancellationEventArgs) {
}

function doRecognizeOnceAsync() {
  reco.recognizeOnceAsync(
    function (successfulResult) {
      onRecognizedResult(successfulResult);
    },
    function (err) {
      window.console.log(err);
    });
}


let introDiv, phraseDiv, phraseSpan;
let curPhrase = 0;
let phrases;

function setup() {
  noCanvas();
  introDiv = select('#intro');
  introDiv.mousePressed(start)
  phraseDiv = select('#phrase');
  phraseDiv.hide();
  phraseSpan = select('#phrase-span');

}

function start() {
  introDiv.hide();
  phraseDiv.style('display:flex');
  loadJSON(serverPath+'phrases.json', playback, playlive);

}

function playback(data) {
  console.log(data);
  phrases = data;
  setTimeout(playPhrase, 2000);
}

function playlive() {
  console.log('playback not found, going live');
  if (window.SpeechSDK) {
    SpeechSDK = window.SpeechSDK;
    RequestAuthorizationToken();
  }
}

function playPhrase() {
  let phrase = phrases[curPhrase];
  let sound = new Audio(serverPath + phrase.file);
  sound.play();
  sound.onended = function() {
    console.log('done');
    setTimeout(playPhrase, 2000);
  }
  phraseSpan.html(phrase.transcript);
  curPhrase = (curPhrase+1)%phrases.length;
}