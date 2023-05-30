var tiny$1 = function tiny(string) {
	if (typeof string !== "string") throw new TypeError("type was not of a String!");
	return string.replace(/\s/g, "");
};

var tiny = tiny$1.tiny;

export { tiny as default };
//# sourceMappingURL=tiny.mjs.map
