//See: https://github.com/ethereum/wiki/wiki/RLP

import { hexlify } from "@ethersproject/bytes";

import { logger } from "./logger.js";

import type { BytesLike } from "@ethersproject/bytes";

import type { RlpStructuredData } from "./types.js";


function hexlifyByte(value: number): string {
    let result = value.toString(16);
    while (result.length < 2) { result = "0" + result; }
    return "0x" + result;
}

function unarrayifyInteger(data: Uint8Array, offset: number, length: number): number {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = (result * 256) + data[offset + i];
    }
    return result;
}

type Decoded = {
    result: any;
    consumed: number;
};

function _decodeChildren(data: Uint8Array, offset: number, childOffset: number, length: number): Decoded {
    const result = [];

    while (childOffset < offset + 1 + length) {
        const decoded = _decode(data, childOffset);

        result.push(decoded.result);

        childOffset += decoded.consumed;
        if (childOffset > offset + 1 + length) {
            logger.throwError("child data too short", "BUFFER_OVERRUN", {
                buffer: data, length, offset
            });
        }
    }

    return {consumed: (1 + length), result: result};
}

// returns { consumed: number, result: Object }
function _decode(data: Uint8Array, offset: number): { consumed: number, result: any } {
    if (data.length === 0) {
        logger.throwError("data too short", "BUFFER_OVERRUN", {
            buffer: data, length: 0, offset: 1
        });
    }

    const checkOffset = (offset: number) => {
        if (offset > data.length) {
            logger.throwError("data short segment too short", "BUFFER_OVERRUN", {
                buffer: data, length: data.length, offset
            });
        }
    };

    // Array with extra length prefix
    if (data[offset] >= 0xf8) {
        const lengthLength = data[offset] - 0xf7;
        checkOffset(offset + 1 + lengthLength);

        const length = unarrayifyInteger(data, offset + 1, lengthLength);
        checkOffset(offset + 1 + lengthLength + length);

        return _decodeChildren(data, offset, offset + 1 + lengthLength, lengthLength + length);

    } else if (data[offset] >= 0xc0) {
        const length = data[offset] - 0xc0;
        checkOffset(offset + 1 + length);

        return _decodeChildren(data, offset, offset + 1, length);

    } else if (data[offset] >= 0xb8) {
        const lengthLength = data[offset] - 0xb7;
        checkOffset(offset + 1 + lengthLength);

        const length = unarrayifyInteger(data, offset + 1, lengthLength);
        checkOffset(offset + 1 + lengthLength + length);

        const result = hexlify(data.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length));
        return { consumed: (1 + lengthLength + length), result: result }

    } else if (data[offset] >= 0x80) {
        const length = data[offset] - 0x80;
        checkOffset(offset + 1 + length);

        const result = hexlify(data.slice(offset + 1, offset + 1 + length));
        return { consumed: (1 + length), result: result }
    }

    return { consumed: 1, result: hexlifyByte(data[offset]) };
}

export function decodeRlp(_data: BytesLike): RlpStructuredData {
    const data = logger.getBytes(_data, "data");
    const decoded = _decode(data, 0);
    if (decoded.consumed !== data.length) {
        logger.throwArgumentError("unexpected junk after rlp payload", "data", _data);
    }
    return decoded.result;
}

