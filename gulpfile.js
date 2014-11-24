/* jshint node: true */

var gulp = require('gulp');
var vulcanize = require('gulp-vulcanize');
var compass = require('gulp-compass');
var path = require('path');
var autoprefixer = require('gulp-autoprefixer');
var foreach = require('gulp-foreach');
var del = require('del');
var i18n_replace = require('./gulp_scripts/i18n_replace');
var i18n_index = require('./gulp_scripts/i18n_index');
var closureCompiler = require('gulp-closure-compiler');
var mergeStream = require('merge-stream');
var argv = require('yargs').argv;

var COMPILER_PATH = 'components/closure-compiler/compiler.jar';
var COMPASS_FILES = '{scenes,sass,elements}/**/*.scss';

var DIST_DIR = argv.pretty ? 'dist_pretty' : 'dist';

// scenes are whitelisted into compilation here
var SCENE_CLOSURE_CONFIG = {
  airport: {
    entryPoint: 'app.Belt'
  }
};

gulp.task('clean', function(cleanCallback) {
  del([DIST_DIR], cleanCallback);
});

gulp.task('compass', function() {
  return gulp.src(COMPASS_FILES)
    .pipe(compass({
      project: path.join(__dirname, '/'),
      css: '',
      sass: '',
      environment: 'production',
    }))

    // NOTE: autoprefixes css properties that need it
    .pipe(autoprefixer({}))
    .pipe(gulp.dest('.'));
});

gulp.task('compile-scenes', function() {
  var sceneNames = Object.keys(SCENE_CLOSURE_CONFIG);

  // compile each scene, merging them into a single gulp stream as we go
  return sceneNames.reduce(function(stream, sceneName) {
    var config = SCENE_CLOSURE_CONFIG[sceneName];

    return stream.add(gulp.src([
      'scenes/' + sceneName + '/js/*.js',

      // add closure's base.js to get @export support in scene code
      'third_party/lib/base.js',

      // these externs are annotated with @externs, so we can import them as
      // source (so we can use use wildcards in the file name)
      'third_party/externs/greensock/*.js',
      'third_party/externs/jquery/*.js',
    ])
    .pipe(closureCompiler({
      compilerPath: COMPILER_PATH,
      fileName: sceneName + '-scene.min.js',
      closure_entry_point: config.entryPoint,
      compilerFlags: addCompilerFlagOptions({
        compilation_level: 'ADVANCED_OPTIMIZATIONS',
        // warning_level: 'VERBOSE',
        language_in: 'ECMASCRIPT5_STRICT',
        process_closure_primitives: null,
        generate_exports: null,
        jscomp_warning: [
          // https://github.com/google/closure-compiler/wiki/Warnings
          'accessControls',
          'const',
          'visibility'
        ],
        // scenes namespace themselves to `app.*`. Move this namespace into
        // the global `scenes.sceneName`
        output_wrapper:
            'var scenes = scenes || {};\n' +
            'scenes.' + sceneName + ' = scenes.' + sceneName + ' || {};\n' +
            '(function(){%output%}).call({ app: scenes.' + sceneName + ' });'
      })
    }))
    .pipe(gulp.dest('scenes/' + sceneName)));
  }, mergeStream());
});

function addCompilerFlagOptions(opts) {
  // Add any compiler options specified by command line flags.
  if (argv.pretty) {
    opts.formatting = 'PRETTY_PRINT';
  }
  return opts;
}

gulp.task('vulcanize-scenes', ['clean', 'compass', 'compile-scenes'], function() {
  return gulp.src([
      'scenes/*/*-scene*.html'
    ], {base: './'})
    // gulp-vulcanize doesn't currently handle multiple files in multiple
    // directories well right now, so vulcanize them one at a time
    .pipe(foreach(function(stream, file) {
      var dest = path.dirname(path.relative(__dirname, file.path));
      return stream.pipe(vulcanize({
        excludes: {
          // these are inlined in elements.html
          imports: [
            'polymer.html$',
            'base-scene.html$',
            'i18n-msg.html$'
          ]
        },
        strip: !argv.pretty,
        csp: true,
        inline: true,
        dest: dest
      }))
      .pipe(i18n_replace({
        path: '_messages'
      }))
      .pipe(gulp.dest(path.join(DIST_DIR, dest)));
    }));
});

// vulcanize elements separately as we want to inline polymer.html and
// base-scene.html here
gulp.task('vulcanize-elements', ['clean', 'compass'], function() {
  return gulp.src('elements/elements_en.html', {base: './'})
    .pipe(vulcanize({
      strip: !argv.pretty,
      csp: true,
      inline: true,
      dest: 'elements/'
    }))
    .pipe(i18n_replace({
      path: '_messages'
    }))
    .pipe(gulp.dest(DIST_DIR + '/elements/'));
});

gulp.task('vulcanize', ['vulcanize-scenes', 'vulcanize-elements']);

gulp.task('i18n_index', ['vulcanize'], function() {
  return gulp.src('index.html')
    .pipe(i18n_index({
      locales: ['fr'],
    }))
    .pipe(gulp.dest(DIST_DIR));
});

// copy needed assets (images, sounds, polymer elements, etc) to dist directory
gulp.task('copy-assets', ['clean', 'vulcanize', 'i18n_index'], function() {
  return gulp.src([
    'index.html',
    'schedule.html',
    'manifest.json',
    'audio/*',
    'images/*.{png,svg,gif,ico}',
    'js/**',
    'sass/*.css',
    'scenes/**/img/**/*.{png,svg,gif}',
    'elements/**/img/*.{png,svg,gif}',
    'components/platform/*',
    'components/polymer/*',
    'components/webcomponentsjs/webcomponents.min.js'
  ], {base: './'})
  .pipe(gulp.dest(DIST_DIR));
});

gulp.task('watch', function() {
  gulp.watch(COMPASS_FILES, ['compass']);
});

gulp.task('default', ['copy-assets']);
