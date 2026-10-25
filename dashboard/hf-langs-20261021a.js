/* hf-langs-20261021a: ONE shared full language list for HubFace pickers (Moderator card, Finn/Ava language cards; the
   Properties auto-detect picker should reuse window.HF_LANGS). code = app code, speech = BCP-47 tag for speech/TTS. */
(function(){if(window.HF_LANGS)return;
window.HF_LANGS=[
['auto','Auto-detect','' ],['en','English','en-US'],['es','Español (Spanish)','es-ES'],['fr','Français (French)','fr-FR'],['de','Deutsch (German)','de-DE'],
['it','Italiano (Italian)','it-IT'],['pt','Português (Portuguese)','pt-BR'],['nl','Nederlands (Dutch)','nl-NL'],['sv','Svenska (Swedish)','sv-SE'],['no','Norsk (Norwegian)','nb-NO'],
['da','Dansk (Danish)','da-DK'],['fi','Suomi (Finnish)','fi-FI'],['pl','Polski (Polish)','pl-PL'],['cs','Čeština (Czech)','cs-CZ'],['sk','Slovenčina (Slovak)','sk-SK'],
['hu','Magyar (Hungarian)','hu-HU'],['ro','Română (Romanian)','ro-RO'],['bg','Български (Bulgarian)','bg-BG'],['el','Ελληνικά (Greek)','el-GR'],['uk','Українська (Ukrainian)','uk-UA'],
['ru','Русский (Russian)','ru-RU'],['hr','Hrvatski (Croatian)','hr-HR'],['sr','Српски (Serbian)','sr-RS'],['sl','Slovenščina (Slovenian)','sl-SI'],['lt','Lietuvių (Lithuanian)','lt-LT'],
['lv','Latviešu (Latvian)','lv-LV'],['et','Eesti (Estonian)','et-EE'],['tr','Türkçe (Turkish)','tr-TR'],['ar','العربية (Arabic)','ar-SA'],['he','עברית (Hebrew)','he-IL'],
['fa','فارسی (Persian)','fa-IR'],['ur','اردو (Urdu)','ur-PK'],['hi','हिन्दी (Hindi)','hi-IN'],['bn','বাংলা (Bengali)','bn-IN'],['pa','ਪੰਜਾਬੀ (Punjabi)','pa-IN'],
['gu','ગુજરાતી (Gujarati)','gu-IN'],['mr','मराठी (Marathi)','mr-IN'],['ta','தமிழ் (Tamil)','ta-IN'],['te','తెలుగు (Telugu)','te-IN'],['kn','ಕನ್ನಡ (Kannada)','kn-IN'],
['ml','മലയാളം (Malayalam)','ml-IN'],['zh','中文 (Chinese, Simplified)','zh-CN'],['zh-TW','中文 (Chinese, Traditional)','zh-TW'],['ja','日本語 (Japanese)','ja-JP'],['ko','한국어 (Korean)','ko-KR'],
['vi','Tiếng Việt (Vietnamese)','vi-VN'],['th','ไทย (Thai)','th-TH'],['id','Bahasa Indonesia','id-ID'],['ms','Bahasa Melayu (Malay)','ms-MY'],['fil','Filipino','fil-PH'],
['sw','Kiswahili (Swahili)','sw-KE'],['af','Afrikaans','af-ZA'],['zu','isiZulu (Zulu)','zu-ZA'],['am','አማርኛ (Amharic)','am-ET'],['ca','Català (Catalan)','ca-ES'],
['ga','Gaeilge (Irish)','ga-IE'],['cy','Cymraeg (Welsh)','cy-GB'],['is','Íslenska (Icelandic)','is-IS']
].map(function(a){return {code:a[0],name:a[1],speech:a[2]};});
window.HF_LANGS.byCode=function(c){for(var i=0;i<window.HF_LANGS.length;i++)if(window.HF_LANGS[i].code===c)return window.HF_LANGS[i];return null;};
window.HF_LANGS.options=function(sel){return window.HF_LANGS.map(function(l){return '<option value="'+l.code+'"'+(l.code===sel?' selected':'')+'>'+l.name+'</option>';}).join('');};
})();
