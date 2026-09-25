"""Tests against a running Lab (./ora.sh start-from-git, built from this repository). Skipped if none answers at
$NEPOTEST_LAB (default http://localhost:1999).

They also check that the cached bundles (tests/fixtures, examples) are still what the Lab generates; if the generator
changed, re-create them:  python -m nepotest convert <program.xml> -o <bundle.json>
"""

import os
import unittest
import urllib.request

from nepotest import Bundle, ConversionError, LabClient, TestSubject

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
LAB = os.environ.get('NEPOTEST_LAB', 'http://localhost:1999')
GOLDEN = os.path.join(REPO, 'OpenRobertaServer', 'src', 'test', 'resources', 'crossCompilerTests', 'robotSpecific', 'edison')


def lab_is_running():
    try:
        urllib.request.urlopen(LAB, timeout=2)
        return True
    except Exception:
        return False


@unittest.skipUnless(lab_is_running(), 'no Lab at %s' % LAB)
class LiveLab(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab = LabClient(LAB)

    def assertBundleCurrent(self, xml_path, bundle_path):
        with open(xml_path, encoding='utf-8') as f:
            fresh = self.lab.convert(f.read())
        self.assertTrue(fresh.ok, fresh.message)
        cached = Bundle.load(bundle_path)
        self.assertEqual(fresh.edpy, cached.edpy, 'stale bundle %s: the generator changed; convert again' % bundle_path)
        self.assertEqual(fresh.source_map, cached.source_map)

    def test_example_bundle_is_current(self):
        self.assertBundleCurrent(os.path.join(ROOT, 'examples', 'clap_counter.xml'), os.path.join(ROOT, 'examples', 'clap_counter.bundle.json'))

    def test_fixture_bundles_are_current(self):
        for name in ('action', 'control_logic', 'logic_operation', 'math_lists', 'sensors', 'text_messages_functions'):
            with self.subTest(program=name):
                self.assertBundleCurrent(os.path.join(GOLDEN, name + '.xml'), os.path.join(HERE, 'fixtures', name + '.bundle.json'))

    def test_block_errors_come_back_as_conversion_error(self):
        with open(os.path.join(ROOT, 'examples', 'clap_counter.xml'), encoding='utf-8') as f:
            xml = f.read()
        # a tone with a variable frequency is rejected by the Edison validator (NO_CONST_NOT_SUPPORTED)
        tone = ('<block type="robActions_play_tone" id="bad1" intask="true"><value name="FREQUENCE"><block type="variables_get" '
                'id="bad2" intask="true"><mutation datatype="Number"></mutation><field name="VAR">claps</field></block></value>'
                '<value name="DURATION"><block type="math_number" id="bad3" intask="true"><field name="NUM">100</field></block>'
                '</value></block>')
        broken = xml.replace('<block type="robActions_motorDiff_on_for"', tone + '<block type="robActions_motorDiff_on_for"', 1)
        with self.assertRaises(ConversionError) as ctx:
            TestSubject.from_lab(broken, self.lab)
        self.assertIn(('bad1', 'robActions_play_tone', 'NO_CONST_NOT_SUPPORTED'), ctx.exception.block_errors)


if __name__ == '__main__':
    unittest.main()
