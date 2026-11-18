# Development only: synthesize pinyin lines with espeak-ng (voice cmn-latn-pinyin) through its C library, and record
# when each syllable starts (espeak reports a word event per space-separated syllable). Used by tools/tone-data.js.
# usage: python3 tools/tone-espeak.py jobs.json outdir   (jobs: [{id, text, voice, rate, pitch, range}]; writes <id>.raw int16 + index.json)
import ctypes, json, sys, os

lib = ctypes.CDLL('libespeak-ng.so.1')

class EvId(ctypes.Union):
    _fields_ = [('number', ctypes.c_int), ('name', ctypes.c_char_p), ('string', ctypes.c_char * 8)]

class Event(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('unique_identifier', ctypes.c_uint), ('text_position', ctypes.c_int),
                ('length', ctypes.c_int), ('audio_position', ctypes.c_int), ('sample', ctypes.c_int),
                ('user_data', ctypes.c_void_p), ('id', EvId)]

CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
sr = lib.espeak_Initialize(2, 500, None, 0)
state = {'pcm': bytearray(), 'words': []}

def cb(wav, n, ev):
    if wav and n > 0:
        state['pcm'] += ctypes.string_at(wav, n * 2)
    i = 0
    while ev[i].type != 0:
        e = ev[i]
        if e.type == 1:
            state['words'].append({'pos': e.text_position, 'len': e.length, 'ms': e.audio_position, 'sample': e.sample})
        i += 1
    return 0

ccb = CB(cb)
lib.espeak_SetSynthCallback(ccb)
jobs = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
index = []
for j in jobs:
    lib.espeak_SetVoiceByName(j.get('voice', 'cmn-latn-pinyin').encode())
    lib.espeak_SetParameter(1, int(j.get('rate', 160)), 0)
    lib.espeak_SetParameter(3, int(j.get('pitch', 50)), 0)
    lib.espeak_SetParameter(4, int(j.get('range', 50)), 0)
    state['pcm'] = bytearray(); state['words'] = []
    t = j['text'].encode('utf-8')
    lib.espeak_Synth(ctypes.c_char_p(t), len(t) + 1, 0, 1, 0, 1, None, None)
    lib.espeak_Synchronize()
    open(os.path.join(out, j['id'] + '.raw'), 'wb').write(bytes(state['pcm']))
    index.append({'id': j['id'], 'sr': sr, 'n': len(state['pcm']) // 2, 'words': state['words']})
json.dump(index, open(os.path.join(out, 'index.json'), 'w'))
print('synthesized', len(index), 'at', sr)
