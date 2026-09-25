"""Converting NEPO programs with a running OpenRoberta Lab (standard library HTTP only).

    lab = LabClient('http://localhost:1999')        # ./ora.sh start-from-git
    bundle = lab.convert(export_xml)                  # a Bundle: EdPy + source map + annotated XML

The protocol is the one of the Lab's frontend: POST /rest/init (gets an initToken), POST /rest/admin/setRobot, then
POST /rest/projectWorkflow/sourceForTest, which returns what /projectWorkflow/source returns plus the source map.
A Bundle can be saved as JSON, so tests can run later without a server (python -m nepotest convert ...).
"""

import datetime
import hashlib
import json
import urllib.error
import urllib.request

from .nepo import _program_part, config_part

BUNDLE_FORMAT = 'nepotest-bundle'
DEFAULT_CONFIG = ('<block_set robottype="edison" xmlversion="3.1" description="" tags="" xmlns="http://de.fhg.iais.roberta.blockly">'
                  '<instance x="213" y="213"><block type="robBrick_Edison-Brick" id="1" intask="true" deletable="false"/>'
                  '</instance></block_set>')


class LabError(Exception):
    pass


def xml_hash(xml_text):
    return hashlib.sha256(xml_text.encode('utf-8')).hexdigest()


class Bundle(object):
    """A NEPO program as converted by the Lab. ok is False if the Lab rejected the program (see block_errors())."""

    def __init__(self, data):
        if data.get('format') != BUNDLE_FORMAT:
            raise ValueError('not a nepotest bundle')
        self.data = data

    ok = property(lambda self: self.data['rc'] == 'ok' and bool(self.data.get('edpy')))
    xml = property(lambda self: self.data['xml'])
    edpy = property(lambda self: self.data.get('edpy') or '')
    source_map = property(lambda self: self.data.get('source_map'))
    annotated_xml = property(lambda self: self.data.get('annotated_prog_xml') or '')
    message = property(lambda self: self.data.get('message'))

    def matches(self, xml_text):
        return self.data.get('xml_sha256') == xml_hash(xml_text)

    def save(self, path):
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(self.data, f, indent=1, sort_keys=True)
            f.write('\n')

    @classmethod
    def load(cls, path):
        with open(path, encoding='utf-8') as f:
            return cls(json.load(f))


class LabClient(object):
    def __init__(self, url='http://localhost:1999', robot='edisonv2', timeout=60):
        self.url = url.rstrip('/')
        self.robot = robot
        self.timeout = timeout
        self._token = None

    def _post(self, path, data):
        body = {'log': [], 'data': data}
        if self._token:
            body['initToken'] = self._token
        req = urllib.request.Request(self.url + '/rest' + path, json.dumps(body).encode('utf-8'), {'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404 and path == '/projectWorkflow/sourceForTest':
                raise LabError('the Lab at %s has no /rest/projectWorkflow/sourceForTest; it must be built from this repository' % self.url)
            raise LabError('HTTP %s from %s%s' % (e.code, self.url, path))
        except urllib.error.URLError as e:
            raise LabError('no Lab at %s (%s); start one with ./ora.sh start-from-git' % (self.url, e.reason))

    def _connect(self):
        self._token = None
        init = self._post('/init', {'cmd': 'init', 'screenSize': [1920, 1080]})
        if init.get('rc') != 'ok':
            raise LabError('init failed: %s' % init.get('message'))
        self._token = init['initToken']
        robot = self._post('/admin/setRobot', {'cmd': 'setRobot', 'robot': self.robot, 'extensions': {}})
        if robot.get('rc') != 'ok':
            raise LabError('setRobot %s failed: %s' % (self.robot, robot.get('message')))

    def convert(self, xml_text, program_name='nepotest'):
        """Converts a NEPO program (export XML, or program XML) to EdPy. Returns a Bundle (check bundle.ok)."""
        request = {'programName': program_name, 'progXML': _program_part(xml_text), 'confXML': config_part(xml_text) or DEFAULT_CONFIG,
                   'SSID': '', 'password': '', 'language': 'en'}
        for attempt in (1, 2):
            if self._token is None:
                self._connect()
            result = self._post('/projectWorkflow/sourceForTest', request)
            if 'INIT_FAIL' in str(result.get('cause', '')) + str(result.get('message', '')) and attempt == 1:
                self._token = None  # the server was restarted: a new session
                continue
            break
        if result.get('rc') == 'ok' and 'sourceMap' not in result:
            raise LabError('the Lab returned no source map (robot %s has no source map support?)' % self.robot)
        return Bundle({
            'format': BUNDLE_FORMAT, 'version': 1, 'robot': self.robot, 'lab': self.url, 'program_name': program_name,
            'converted_at': datetime.datetime.now().replace(microsecond=0).isoformat(),
            'xml': xml_text, 'xml_sha256': xml_hash(xml_text),
            'rc': result.get('rc'), 'message': result.get('message'), 'cause': result.get('cause'),
            'edpy': result.get('sourceCode'), 'source_map': result.get('sourceMap'),
            'annotated_prog_xml': result.get('progXML'),
        })
