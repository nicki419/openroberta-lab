"""Writes the study's starter code from truth.json into the level files (levels/01-first-steps): each level where a function is new gets
`code`: the function's name, the function the main loop called before, per version of the study's code ("1", "2") the starter's definition
(functions/<function>/<starter>.xml), and the functions the level brings as they are (`given`: their reference version; since 2026-11-08, L6
brings driveInTheDark). The Lab adds it to a learner's program when the level is played (levels.code.ts). A level without a starter loses its
`code`. The rest of each file stays as it is (one item per line, as the Level designer writes it).

python write_level_code.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')


def without_code(text):
    """the file's text without a "code" entry at its end (written before by this script or the Level designer)"""
    i = text.find(',\n "code":')
    if i < 0:
        return text
    end = text.rstrip().rfind('}')
    return text[:i] + '\n' + text[end:]


def main():
    truth = json.load(open(os.path.join(HERE, 'truth.json'), encoding='utf-8'))
    xml = {v['id']: v['function_xml'] for v in truth['versions']}
    for lv in truth['levels']:
        path = os.path.join(ROOT, lv['file'])
        text = without_code(open(path, encoding='utf-8', newline='').read())
        if lv['starter']:
            code = {'function': lv['function'], 'calls': lv['inject']['main_call_before'],
                    'versions': {name: xml[vid] for name, vid in sorted(lv['starter'].items())}}
            given = [{'function': g['function'], 'xml': xml[g['version']]} for g in lv['inject'].get('given') or []]
            given and (code.__setitem__('given', given))
            body = json.dumps(code, indent=1, ensure_ascii=False).replace('\n', '\n ')  # nested one deeper, as JSON.stringify(level, null, 1)
            end = text.rstrip().rfind('}')
            text = text[:end].rstrip() + ',\n "code": ' + body + '\n' + text[end:]
        json.loads(text)
        open(path, 'w', encoding='utf-8', newline='').write(text)
        print('%s: %s' % (lv['file'], ('code of %s, versions %s%s' % (lv['function'], ', '.join(sorted(lv['starter'])), ''.join(
            ', with %s as it is' % g['function'] for g in lv['inject'].get('given') or []))) if lv['starter'] else 'no code'))


if __name__ == '__main__':
    main()
