// Shared themes for notes
const themes = {
    pink: { background: "#FF6FAD", toolbar: "#C95889" }, 
    orange: { background: "#E9806A", toolbar: "#B56B54" }, 
    deepOrange: { background: "#F89C1D", toolbar: "#C77D18" },
    limeGreen: { background: "#C7EC51", toolbar: "#A1B841" }, 
    teal: { background: "#8BC6C4", toolbar: "#6F9C99" }, 
    skyBlue: { background: "#2FC8F2", toolbar: "#249FB8" }, 
    purple: { background: "#6C3499", toolbar: "#51277A" },
    softYellow: { background: "#FCFF9C", toolbar: "#CCC070" },
};


// If we are in Node.js (main Electron process)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = themes;
}