const jsr = require('jasmine-spec-reporter');
// const reporters = require('jasmine-reporters');
// const path = require('path');

jasmine.getEnv().clearReporters();
jasmine.getEnv().addReporter(
	new jsr.SpecReporter({
		spec: {
			displayPending: true,
			displayStacktrace: jsr.StacktraceOption.RAW
		}
	})
);
// jasmine.getEnv().addReporter(
// 	new reporters.JUnitXmlReporter({
// 		savePath: path.dirname(__dirname),
// 		filePrefix: 'junit',
// 		consolidateAll: true
// 	})
// );
