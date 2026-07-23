/**
 * Catalyst Data Store Interface & Official KSP ERD Memory Store
 */

const memoryStore = {
  CaseMaster: [],
  ComplainantDetails: [],
  ActSectionAssociation: [],
  Victim: [],
  Accused: [],
  ArrestSurrender: [],
  Act: [],
  Section: [],
  CrimeHead: [],
  CrimeSubHead: [],
  CaseCategory: [],
  GravityOffence: [],
  CaseStatusMaster: [],
  Court: [],
  District: [],
  State: [],
  Unit: [],
  UnitType: [],
  Rank: [],
  Designation: [],
  Employee: [],
  ChargesheetDetails: [],

  // Operational tables
  incidents: [],
  offenders: [],
  victims: [],
  locations: [],
  flags: [],
  review_decisions: [],
  action_outcomes: []
};

class DataStoreClient {
  constructor(catalystApp = null) {
    this.catalystApp = catalystApp;
  }

  async insert(table, row) {
    const timestampedRow = {
      ...row,
      created_at: row.created_at || new Date().toISOString(),
      ROWID: row.ROWID || (memoryStore[table] ? memoryStore[table].length + 1 : 1)
    };

    if (this.catalystApp && this.catalystApp.datastore) {
      try {
        const tableObj = this.catalystApp.datastore().table(table);
        const result = await tableObj.insertRow(row);
        return result;
      } catch (err) {
        console.warn(`[DataStore] Catalyst SDK insert fallback to memory: ${err.message}`);
      }
    }

    if (!memoryStore[table]) {
      memoryStore[table] = [];
    }

    memoryStore[table].push(timestampedRow);

    // Keep CaseMaster & incidents sync'd
    if (table === 'CaseMaster') {
      memoryStore.incidents.push(timestampedRow);
    } else if (table === 'incidents') {
      memoryStore.CaseMaster.push(timestampedRow);
    }

    return timestampedRow;
  }

  async find(table, filterFn = null) {
    if (this.catalystApp && this.catalystApp.datastore) {
      try {
        const zcql = this.catalystApp.zcql();
        const query = `SELECT * FROM ${table}`;
        const queryRes = await zcql.executeZCQLQuery(query);
        const rows = queryRes.map(item => item[table]);
        return filterFn ? rows.filter(filterFn) : rows;
      } catch (err) {
        console.warn(`[DataStore] Catalyst ZCQL fallback to memory: ${err.message}`);
      }
    }

    const rows = memoryStore[table] || memoryStore.CaseMaster || [];
    return filterFn ? rows.filter(filterFn) : [...rows];
  }

  async findById(table, idKey, idVal) {
    const rows = await this.find(table, row => String(row[idKey]) === String(idVal));
    return rows[0] || null;
  }

  async update(table, idKey, idVal, updateFields) {
    const row = await this.findById(table, idKey, idVal);
    if (!row) return null;

    Object.assign(row, updateFields, { updated_at: new Date().toISOString() });

    if (this.catalystApp && this.catalystApp.datastore) {
      try {
        const tableObj = this.catalystApp.datastore().table(table);
        await tableObj.updateRow(row);
      } catch (err) {
        console.warn(`[DataStore] Catalyst SDK update fallback: ${err.message}`);
      }
    }

    return row;
  }

  getRawStore() {
    return memoryStore;
  }

  seedData(initialData) {
    Object.keys(initialData).forEach(key => {
      if (memoryStore[key]) {
        memoryStore[key] = [...initialData[key]];
      }
    });
  }
}

module.exports = DataStoreClient;
