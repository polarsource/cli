import { describe, expect, test } from "bun:test";
import { parseLossless, stringifyLossless } from "./lossless";

const roundtrip = (text: string) => stringifyLossless(parseLossless(text));

describe("lossless JSON", () => {
	test("preserves whole-number floats", () => {
		expect(roundtrip('{"consumed_units":1200.0,"balance":0.0}')).toBe(
			'{"consumed_units":1200.0,"balance":0.0}',
		);
	});

	test("preserves large integers beyond Number.MAX_SAFE_INTEGER", () => {
		expect(roundtrip('{"id":12345678901234567890}')).toBe(
			'{"id":12345678901234567890}',
		);
	});

	test("compacts whitespace without touching number literals", () => {
		expect(roundtrip('{ "a": [1.0, 2.50, -0.0], "b": 1e5 }')).toBe(
			'{"a":[1.0,2.50,-0.0],"b":1e5}',
		);
	});

	test("preserves object key order including integer-like keys", () => {
		expect(roundtrip('{"2":"b","1":"a"}')).toBe('{"2":"b","1":"a"}');
	});

	test("decodes \\uXXXX escapes to plain UTF-8", () => {
		expect(roundtrip('{"name": "Caf\\u00e9"}')).toBe('{"name":"Café"}');
	});

	test("handles strings with escaped quotes and backslashes", () => {
		expect(roundtrip('{"s":"a\\"b\\\\c"}')).toBe('{"s":"a\\"b\\\\c"}');
	});

	test("handles nested structures, booleans and nulls", () => {
		expect(roundtrip('[{"a": null}, true, false, [], {}]')).toBe(
			'[{"a":null},true,false,[],{}]',
		);
	});

	test("rejects malformed input", () => {
		expect(() => parseLossless('{"a":}')).toThrow(SyntaxError);
		expect(() => parseLossless('{"a":1')).toThrow(SyntaxError);
		expect(() => parseLossless('{"a":1}x')).toThrow(SyntaxError);
	});
});
