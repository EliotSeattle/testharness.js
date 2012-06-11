/*
 * This file is intended for vendors to implement
 * code needed to integrate testharness.js tests with their own test systems.
 *
 * The default implementation extracts metadata from the tests and validates 
 * it against the cached version that should be present in the test source 
 * file. If the cache is not found or is out of sync, source code suitable for
 * caching the metadata is optionally generated.
 *
 * The cached metadata is present for extraction by test processing tools that
 * are unable to execute javascript.
 *
 * Metadata is attached to tests via the properties parameter in the test
 * constructor. See testharness.js for details.
 *
 * Typically test system integration will attach callbacks when each test has
 * run, using add_result_callback(callback(test)), or when the whole test file
 * has completed, using 
 * add_completion_callback(callback(tests, harness_status)).
 *
 * For more documentation about the callback functions and the
 * parameters they are called with see testharness.js
 */



var metadata_generator = {

    currentMetadata: {},
    cachedMetadata: false,
    metadataProperties: ['help', 'assert', 'author'],
    
    error: function(message) {
        var messageElement = document.createElement('p');
        messageElement.setAttribute('class', 'error');
        this.appendText(messageElement, message);
        
        var summary = document.getElementById('summary');
        if (summary) {
            summary.parentNode.insertBefore(messageElement, summary);
        }
        else {
            document.body.appendChild(messageElement);
        }
    },

    /**
     * Ensure property value has contact information
     */
    validateContact: function(test, propertyName) {
        var value = test.properties[propertyName];
        var re = /(\S+)(\s*)<(.*)>(.*)/;
        if (! re.test(value)) {
            re = /(\S+)(\s+)(http[s]?:\/\/)(.*)/
            if (! re.test(value)) {
                this.error('Metadata property "' + propertyName + 
                    '" for test: "' + test.name +
                    '" must have name and contact information ' +
                    '("name <email>" or "name http(s)://")');
            }
        }
        return true;
    },
    
    /**
     * Extract metadata from test object
     */
    extractFromTest: function(test) {
        var testMetadata = {};
        // filter out metadata from other properties in test
        for (var metaIndex = 0; metaIndex < this.metadataProperties.length;
             metaIndex++) {
            var meta = this.metadataProperties[metaIndex];
            if (test.properties.hasOwnProperty(meta)) {
                if ('author' == meta) {
                    this.validateContact(test, meta);
                }
                testMetadata[meta] = test.properties[meta];
            }
        }
        return testMetadata;
    },
    
    /**
     * Compare cached metadata to extracted metadata
     */
    validateCache: function() {
        for (var testName in this.currentMetadata) {
            if (! this.cachedMetadata.hasOwnProperty(testName)) {
                return false;
            }
            var testMetadata = this.currentMetadata[testName];
            var cachedTestMetadata = this.cachedMetadata[testName];
            delete this.cachedMetadata[testName];
            
            for (var metaIndex = 0; metaIndex < this.metadataProperties.length;
                 metaIndex++) {
                var meta = this.metadataProperties[metaIndex];
                if (cachedTestMetadata.hasOwnProperty(meta) && 
                    testMetadata.hasOwnProperty(meta)) {
                    if (! cachedTestMetadata[meta] instanceof Array) {
                        return false;
                    }
                    if (cachedTestMetadata[meta].length == 
                        testMetadata[meta].length) {
                        for (var index = 0; 
                             index < cachedTestMetadata[meta].length; 
                             index++) {
                            if (cachedTestMetadata[meta][index] != 
                                testMetadata[meta][index]) {
                                return false;
                            }
                        }
                    }
                    else {
                        return false
                    }
                }
                else if (cachedTestMetadata.hasOwnProperty(meta) || 
                         testMetadata.hasOwnProperty(meta)) {
                    return false;
                }
            }
        }
        for (var testName in this.cachedMetadata) {
            return false;
        }
        return true;
    },
  
    appendText: function(elemement, text) {
        elemement.appendChild(document.createTextNode(text));
    },
  
    jsonifyArray: function(arrayValue, indent) {
        var output = '[';

        if (1 == arrayValue.length) {
            output += JSON.stringify(arrayValue[0]);
        }
        else {
            for (var index = 0; index < arrayValue.length; index++) {
                if (0 < index) {
                    output += ',\n  ' + indent;
                }
                output += JSON.stringify(arrayValue[index]);
            }
        }
        output += ']';
        return output;
    },
    
    jsonifyObject: function(objectValue, indent) {
        var output = '{';
        
        var first = true;
        for (var property in objectValue) {
            if (! first) {
                output += ',';
            }
            first = false;
            output += '\n  ' + indent + '"' + property + '": ';
            var value = objectValue[property];
            if (value instanceof Array) {
                output += this.jsonifyArray(value, indent + 
                    '                '.substr(0, 5 + property.length));
            }
            else if ('object' == typeof(value)) {
                output += this.jsonifyObject(value, indent + '  ');
            }
            else {
                output += JSON.stringify(value);
            }
        }
        if (1 < output.length) {
            output += '\n' + indent;
        }
        output += '}';
        return output;
    },
  
    /**
     * Generate javascript source code for captured metadata
     * Metadata is in pretty-printed JSON format
     */
    generateSource: function() {
        var source = 
            '<script id="metadata_cache">/*\n' + 
            this.jsonifyObject(this.currentMetadata, '') + '\n' + 
            '*/</script>\n';
        return source;
    },
    
    /**
     * Add element containing metadata source code
     */
    addSourceElement: function(event) {
        var sourceWrapper = document.createElement('div');
        sourceWrapper.setAttribute('id', 'metadata_source');

        var instructions = document.createElement('p');
        if (this.cachedMetadata) {
            this.appendText(instructions, 
                'Replace the existing <script id="metadata_cache"> element ' + 
                'in the test\'s <head> with the following:');
        }
        else {
            this.appendText(instructions, 
                'Copy the following into the <head> element of the test ' +
                'or the test\'s metadata sidecar file:');
        }
        sourceWrapper.appendChild(instructions);
        
        var sourceElement = document.createElement('pre');
        this.appendText(sourceElement, this.generateSource());

        sourceWrapper.appendChild(sourceElement);
        
        var messageElement = document.getElementById('metadata_issue');
        messageElement.parentNode.insertBefore(sourceWrapper, 
                                               messageElement.nextSibling);
        messageElement.parentNode.removeChild(messageElement);

        (event.preventDefault) ? event.preventDefault() : 
                                 event.returnValue = false;
    },
    
    /**
     * Extract the metadata cache from the cache element if present
     */
    getCachedMetadata: function() {
        var cacheElement = document.getElementById('metadata_cache');
        
        if (cacheElement) {
            var cacheText = cacheElement.firstChild.nodeValue;
            var openBrace = cacheText.indexOf('{');
            var closeBrace = cacheText.lastIndexOf('}');
            if ((-1 < openBrace) && (-1 < closeBrace)) {
                cacheText = cacheText.slice(openBrace, closeBrace + 1);
                try {
                    this.cachedMetadata = JSON.parse(cacheText);
                }
                catch (exc) {
                    this.cachedMetadata = 'Invalid JSON in Cached metadata. ';
                }
            }
            else {
                this.cachedMetadata = 'Metadata not found in cache element. ';
            }
        }
    },
    
    /**
     * Main entry point, extract metadata from tests, compare to cached version
     * if present.
     * If cache not present or differs from extrated metadata, generate an error
     */
    process: function(tests, harness_status) {
        for (var index = 0; index < tests.length; index++) {
            var test = tests[index];
            if (this.currentMetadata[test.name]) {
                this.error('Duplicate test name: ' + test.name);
            }
            else {
                this.currentMetadata[test.name] = this.extractFromTest(test);
            }
        }

        this.getCachedMetadata();
        
        var message = null;
        var messageClass = 'warning';
        if (this.cachedMetadata) {
            messageClass = 'error';
            if ('string' == typeof(this.cachedMetadata)) {
                message = this.cachedMetadata;
            }
            else if (! this.validateCache()) {
                message = 'Cached metadata out of sync. ';
            }
        }
        else {
            message = 'Cached metdata not present. ';
        }
        
        if (message) {
            var messageElement = document.createElement('p');
            messageElement.setAttribute('id', 'metadata_issue');
            messageElement.setAttribute('class', messageClass);
            this.appendText(messageElement, message);
            
            var link = document.createElement('a');
            this.appendText(link, 'Click for source code.');
            link.setAttribute('href', '#');
            link.setAttribute('onclick', 
                              'metadata_generator.addSourceElement(event)');
            messageElement.appendChild(link);
            
            var summary = document.getElementById('summary');
            if (summary) {
                summary.parentNode.insertBefore(messageElement, summary);
            }
            else {
                document.body.appendChild(messageElement);
            }
        }
    },

    setup: function() {
        add_completion_callback(
            function (tests, harness_status) { 
                metadata_generator.process(tests, harness_status)
            });
    }
}

metadata_generator.setup();
// vim: set expandtab shiftwidth=4 tabstop=4: