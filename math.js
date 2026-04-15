export function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

export function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

export class Vector2 {
    /** @type {number} */
    #x;
    /** @type {number} */
    #y;
    /** @type {number} */
    #magnitude;
    /** @type {number} */
    #angle;

    /**
     * @param {number} x
     * @param {number} y
     */
    constructor(x, y) {
        this.#x = x;
        this.#y = y;
        this.#magnitude = Math.sqrt(Math.pow(x, 2.0) + Math.pow(y, 2.0));
        this.#angle = Math.atan2(y, x);
    }

    get x() { return this.#x; }
    get y() { return this.#y; }
    get magnitude() { return this.#magnitude; }
    get angle() { return this.#angle; }

    get normalized() {
        return new Vector2(this.#x / this.#magnitude, this.#y / this.#magnitude);
    }

    get inverse() {
        return this.times(-1.0);
    }

    times(n) {
        return new Vector2(this.#x * n, this.#y * n);
    }

    add(v) {
        return new Vector2(this.#x + v.#x, this.#y + v.#y);
    }

    rot(angle) {
        return new Vector2(
            this.#x * Math.cos(angle) - this.#y * Math.sin(angle),
            this.#x * Math.sin(angle) + this.#y * Math.cos(angle)
        );
    }

    dot(v) {
        return this.#x * v.#x + this.#y * v.#y;
    }

    static create(angle, magnitude) {
        return new Vector2(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
    }
}