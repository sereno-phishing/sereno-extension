/* Administration · per-domain policy: what happens when a listed domain is
   detected as phishing. Classic script that registers Sereno.domainPolicy.
   Pure: every function returns new rows; "today" is passed in. */

(function (Sereno) {
  "use strict";

  var POLICIES = {
    advertencia: { id: "advertencia", label: "Advertencia", tone: "warn" },
    bloqueo: { id: "bloqueo", label: "Bloqueo duro", tone: "bad" }
  };
  var POLICY_IDS = ["advertencia", "bloqueo"];
  /* Applied to domains that are not in the list, and preselected when adding. */
  var DEFAULT_POLICY = "advertencia";

  function isPolicy(id) {
    return POLICY_IDS.indexOf(id) >= 0;
  }

  /* Unknown ids fall back to the default policy. */
  function policyOrDefault(id) {
    return isPolicy(id) ? id : DEFAULT_POLICY;
  }

  function normalizeDomain(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function toRow(row) {
    return { domain: row.domain, policy: row.policy, updatedAt: row.updatedAt };
  }

  function contains(rows, domain) {
    return rows.some(function (row) {
      return row.domain === domain;
    });
  }

  /* -> { rows, added }: added is null when the domain is already listed. */
  function addRow(rows, domain, policy, today) {
    if (contains(rows, domain)) {
      return { rows: rows.slice(), added: null };
    }
    var added = { domain: domain, policy: policy, updatedAt: today };
    return { rows: [added].concat(rows), added: added };
  }

  /* Puts a row first in a stored list, replacing any previous row for that domain. */
  function upsertFirst(rows, row) {
    return [toRow(row)].concat(
      (rows || []).filter(function (item) {
        return item.domain !== row.domain;
      })
    );
  }

  function withPolicy(rows, domain, policy) {
    return rows.map(function (row) {
      return row.domain === domain ? { domain: row.domain, policy: policy, updatedAt: row.updatedAt } : row;
    });
  }

  function without(rows, domain) {
    return rows.filter(function (row) {
      return row.domain !== domain;
    });
  }

  /* Rows that are new or whose policy changed against the stored list get today's date. */
  function stampChanges(rows, stored, today) {
    return rows.map(function (row) {
      var previous = null;
      (stored || []).forEach(function (item) {
        if (item.domain === row.domain) {
          previous = item;
        }
      });
      var changed = !previous || previous.policy !== row.policy;
      return { domain: row.domain, policy: row.policy, updatedAt: changed ? today : row.updatedAt };
    });
  }

  Sereno.domainPolicy = {
    POLICIES: POLICIES,
    POLICY_IDS: POLICY_IDS,
    DEFAULT_POLICY: DEFAULT_POLICY,
    isPolicy: isPolicy,
    policyOrDefault: policyOrDefault,
    normalizeDomain: normalizeDomain,
    toRow: toRow,
    addRow: addRow,
    upsertFirst: upsertFirst,
    withPolicy: withPolicy,
    without: without,
    stampChanges: stampChanges
  };
})(globalThis.Sereno = globalThis.Sereno || {});
