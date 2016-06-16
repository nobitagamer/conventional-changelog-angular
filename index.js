'use strict'
var compareFunc = require('compare-func')
var Q = require('q')
var readFile = Q.denodeify(require('fs').readFile)
var resolve = require('path').resolve
var path = require('path')
var pkgJson = {}
var gufg = require('github-url-from-git')
const urlParser = require('url')

try {
  pkgJson = require(path.resolve(
    process.cwd(),
    './package.json'
  ))
} catch (err) {
  console.error('no root package.json found')
}

var parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?: (.*)$/,
  headerCorrespondence: [
    'type',
    'scope',
    'subject'
  ],
  noteKeywords: ['BREAKING CHANGE', 'ISSUES CLOSED'],
  revertPattern: /^revert:\s([\s\S]*?)\s*This reverts commit (\w*)\./,
  revertCorrespondence: ['header', 'hash']
}

function jiraIssueUrl () {
  var url = null
  if (pkgJson.bugs && pkgJson.bugs.url && ~pkgJson.bugs.url.indexOf('jira')) {
    var jiraUrl = urlParser.parse(pkgJson.bugs.url)

    if (jiraUrl) {
      return jiraUrl.protocol + '//' + jiraUrl.host + '/browse/'
    } else {
      return url
    }
  }
}

function issueUrl () {
  var url = null
  if (pkgJson.repository && pkgJson.repository.url && ~pkgJson.repository.url.indexOf('github.com')) {
    var gitUrl = gufg(pkgJson.repository.url)

    if (gitUrl) {
      return gitUrl + '/issues/'
    } else {
      return url
    }
  }
}

var writerOpts = {
  transform: function (commit) {
    var discard = true
    var url = jiraIssueUrl()

    commit.notes.forEach(function (note) {
      if (note.title === 'BREAKING CHANGE') {
        note.title = 'BREAKING CHANGES'
      }

      if (note.title.startsWith('ISSUES CLOSED')) {
        note.text = note.text.replace(/((?::(\b|^))|(([A-Z]{2,}\-\d+)\2))/g, '[$3](' + url + '$3)$2')
      }
      discard = false
    })

    if (commit.type === 'feat') {
      commit.type = 'Features'
    } else if (commit.type === 'fix') {
      commit.type = 'Bug Fixes'
    } else if (commit.type === 'perf') {
      commit.type = 'Performance Improvements'
    } else if (commit.type === 'revert') {
      commit.type = 'Reverts'
    } else if (discard) {
      return
    } else if (commit.type === 'docs') {
      commit.type = 'Documentation'
    } else if (commit.type === 'style') {
      commit.type = 'Styles'
    } else if (commit.type === 'refactor') {
      commit.type = 'Code Refactoring'
    } else if (commit.type === 'test') {
      commit.type = 'Tests'
    } else if (commit.type === 'chore') {
      commit.type = 'Chores'
    }

    if (commit.scope === '*') {
      commit.scope = ''
    }

    if (typeof commit.hash === 'string') {
      commit.hash = commit.hash.substring(0, 17)
    }

    if (typeof commit.subject === 'string') {
      if (url) {
        // Jira issue URLs.
        commit.subject = commit.subject.replace(/((?::(\b|^))|(([A-Z]{2,}\-\d+)\2))/g, '[$3](' + url + '$3)$2')
      // commit.subject = commit.subject.replace(/( ?)#([0-9]+)(\b|^)/g, '$1[#$2](' + url + '$2)$3')
      }
      // GitHub user URLs.
      // /commit.subject = commit.subject.replace(/( ?)@([a-zA-Z0-9_]+)(\b|^)/g, '$1[@$2](https://github.com/$2)$3')
      commit.subject = commit.subject
    }

    return commit
  },
  groupBy: 'type',
  commitGroupsSort: 'title',
  commitsSort: ['scope', 'subject'],
  noteGroupsSort: 'title',
  notesSort: compareFunc
}

module.exports = Q.all([
  readFile(resolve(__dirname, 'templates/template.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/header.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/commit.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/footer.hbs'), 'utf-8')
])
  .spread(function (template, header, commit, footer) {
    writerOpts.mainTemplate = template
    writerOpts.headerPartial = header
    writerOpts.commitPartial = commit
    writerOpts.footerPartial = footer

    return {
      parserOpts: parserOpts,
      writerOpts: writerOpts
    }
  })
