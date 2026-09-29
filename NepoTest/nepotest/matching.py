"""Value matchers of the test format (docs/ai/nepo-unit-testing.md, "Matchers"), shared by spec.py and states.py.

A value matches if it's equal (numbers numerically; booleans only booleans), within {"min": a, "max": b}, within
{"approx": x, "tol": d}, or if it doesn't match {"not": v}. An object matcher matches a dict if every key is present and
its value matches.
"""


def value_matches(expected, actual):
    if isinstance(expected, dict) and 'not' in expected:
        return not value_matches(expected['not'], actual)
    if isinstance(expected, dict) and ('min' in expected or 'max' in expected):
        return isinstance(actual, (int, float)) and not isinstance(actual, bool) and \
            expected.get('min', actual) <= actual <= expected.get('max', actual)
    if isinstance(expected, dict) and 'approx' in expected:
        return isinstance(actual, (int, float)) and abs(actual - expected['approx']) <= expected.get('tol', 1e-6)
    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected is actual or (isinstance(expected, bool) and isinstance(actual, bool) and expected == actual)
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        return abs(expected - actual) < 1e-9
    return expected == actual


def matches(matcher, item):
    return all(k in item and value_matches(v, item[k]) for k, v in matcher.items())


def is_matcher(value):
    """a valid value matcher: a plain value, or one of the matcher objects"""
    if not isinstance(value, dict):
        return True
    if 'not' in value:
        return len(value) == 1 and is_matcher(value['not'])
    if 'approx' in value:
        return set(value) <= {'approx', 'tol'} and _number(value['approx']) and _number(value.get('tol', 0))
    if 'min' in value or 'max' in value:
        return set(value) <= {'min', 'max'} and all(_number(v) for v in value.values())
    return False


def _number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def describe_matcher(value):
    """a matcher in words: '= 3', '≠ 3', '≥ 3', '≤ 3', 'between 2 and 5', '≈ 20 (± 1)'"""
    if isinstance(value, dict) and 'not' in value:
        return '≠ %s' % _show(value['not'])
    if isinstance(value, dict) and 'approx' in value:
        return '≈ %s (± %s)' % (_show(value['approx']), _show(value.get('tol', 0)))
    if isinstance(value, dict) and 'min' in value and 'max' in value:
        return 'between %s and %s' % (_show(value['min']), _show(value['max']))
    if isinstance(value, dict) and 'min' in value:
        return '≥ %s' % _show(value['min'])
    if isinstance(value, dict) and 'max' in value:
        return '≤ %s' % _show(value['max'])
    return '= %s' % _show(value)


def _show(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)
