/**
 * Lossless JSON parsing and compact re-serialization.
 *
 * The listen stream signs webhook payloads over their ORIGINAL serialized
 * bytes, but delivers them as parsed JSON objects embedded in the SSE frame.
 * Rebuilding the body with `JSON.stringify(JSON.parse(...))` changes number
 * formatting (`1200.0` becomes `1200`), which breaks the Standard Webhooks
 * signature at the receiving endpoint. This parser keeps the exact source
 * text of every number so the payload can be re-serialized with the same
 * bytes it was signed over.
 *
 * Objects are represented as `Map`s rather than plain objects because plain
 * JS objects reorder integer-like string keys, which would also change the
 * signed bytes.
 */

/** A JSON number carrying its exact source text. */
export class RawNumber {
	constructor(readonly raw: string) {}
}

export type LosslessValue =
	| null
	| boolean
	| string
	| RawNumber
	| LosslessValue[]
	| Map<string, LosslessValue>;

const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

class Parser {
	private index = 0;

	constructor(private readonly text: string) {}

	parse(): LosslessValue {
		const value = this.parseValue();
		this.skipWhitespace();
		if (this.index !== this.text.length) {
			throw new SyntaxError(`Unexpected trailing input at ${this.index}`);
		}
		return value;
	}

	private skipWhitespace() {
		while (this.index < this.text.length) {
			const ch = this.text[this.index];
			if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
				this.index++;
			} else {
				break;
			}
		}
	}

	private parseValue(): LosslessValue {
		this.skipWhitespace();
		const ch = this.text[this.index];
		switch (ch) {
			case undefined:
				throw new SyntaxError("Unexpected end of input");
			case "{":
				return this.parseObject();
			case "[":
				return this.parseArray();
			case '"':
				return this.parseString();
			case "t":
				this.expectLiteral("true");
				return true;
			case "f":
				this.expectLiteral("false");
				return false;
			case "n":
				this.expectLiteral("null");
				return null;
			default:
				return this.parseNumber();
		}
	}

	private expectLiteral(literal: string) {
		if (this.text.startsWith(literal, this.index)) {
			this.index += literal.length;
		} else {
			throw new SyntaxError(`Invalid literal at ${this.index}`);
		}
	}

	private parseNumber(): RawNumber {
		NUMBER_PATTERN.lastIndex = this.index;
		const match = NUMBER_PATTERN.exec(this.text);
		if (!match || match.index !== this.index) {
			throw new SyntaxError(`Invalid number at ${this.index}`);
		}
		this.index += match[0].length;
		return new RawNumber(match[0]);
	}

	private parseString(): string {
		const start = this.index;
		this.index++; // opening quote
		while (this.index < this.text.length) {
			const ch = this.text[this.index];
			if (ch === "\\") {
				this.index += 2;
			} else if (ch === '"') {
				this.index++;
				// Delegate escape handling to the built-in parser.
				return JSON.parse(this.text.slice(start, this.index)) as string;
			} else {
				this.index++;
			}
		}
		throw new SyntaxError(`Unterminated string at ${start}`);
	}

	private parseArray(): LosslessValue[] {
		this.index++; // "["
		const items: LosslessValue[] = [];
		this.skipWhitespace();
		if (this.text[this.index] === "]") {
			this.index++;
			return items;
		}
		for (;;) {
			items.push(this.parseValue());
			this.skipWhitespace();
			const ch = this.text[this.index];
			if (ch === ",") {
				this.index++;
			} else if (ch === "]") {
				this.index++;
				return items;
			} else {
				throw new SyntaxError(`Expected "," or "]" at ${this.index}`);
			}
		}
	}

	private parseObject(): Map<string, LosslessValue> {
		this.index++; // "{"
		const entries = new Map<string, LosslessValue>();
		this.skipWhitespace();
		if (this.text[this.index] === "}") {
			this.index++;
			return entries;
		}
		for (;;) {
			this.skipWhitespace();
			if (this.text[this.index] !== '"') {
				throw new SyntaxError(`Expected object key at ${this.index}`);
			}
			const key = this.parseString();
			this.skipWhitespace();
			if (this.text[this.index] !== ":") {
				throw new SyntaxError(`Expected ":" at ${this.index}`);
			}
			this.index++;
			entries.set(key, this.parseValue());
			this.skipWhitespace();
			const ch = this.text[this.index];
			if (ch === ",") {
				this.index++;
			} else if (ch === "}") {
				this.index++;
				return entries;
			} else {
				throw new SyntaxError(`Expected "," or "}" at ${this.index}`);
			}
		}
	}
}

/** Parses JSON text, preserving the source text of every number. */
export const parseLossless = (text: string): LosslessValue =>
	new Parser(text).parse();

/**
 * Serializes a lossless value compactly (no whitespace), emitting numbers
 * exactly as they appeared in the parsed source.
 */
export const stringifyLossless = (value: LosslessValue): string => {
	if (value === null) {
		return "null";
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (value instanceof RawNumber) {
		return value.raw;
	}
	if (Array.isArray(value)) {
		return `[${value.map(stringifyLossless).join(",")}]`;
	}
	const entries = Array.from(
		value.entries(),
		([key, entry]) => `${JSON.stringify(key)}:${stringifyLossless(entry)}`,
	);
	return `{${entries.join(",")}}`;
};
