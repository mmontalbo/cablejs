
function generateBanner() {
  var d = new Date().toISOString();
  d += new Array(38 - d.length).join(" ");
  return [
    "/*.......................................",
    ". cablejs: By Wyatt Allen, MIT Licenced .",
    ". " + d + " .",
    ".......................................*/"
  ].join("\n");
}

module.exports = function(grunt) {
  
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-closurecompiler');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    concat: {
      options: {
        stripBanners: true,
        banner: generateBanner() + "\n"
      },
      dist: {
        src: ["src/core.js", "src/helpers.js", "src/dependent.js"],
        dest: 'cable.dev.js',
      }
    },

    closurecompiler: {
      minify: {
        files: {
          "cable.min.js": ["src/core.js", "src/helpers.js", "src/dependent.js"]
        },
        options: {
          // Any options supported by Closure Compiler, for example:
          
          "compilation_level": "SIMPLE_OPTIMIZATIONS",

          "language_in": "ECMASCRIPT5_STRICT",

          // Plus a simultaneous processes limit
          "max_processes": 5,

          // And an option to add a banner, license or similar on top
          "banner":generateBanner(),
        }
      }
    }
  });

  grunt.registerTask('build', ["concat:dist", 'closurecompiler:minify']); 

  grunt.registerTask('default', ['build']); 
};
