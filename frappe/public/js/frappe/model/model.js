// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide('frappe.model');

$.extend(frappe.model, {
	no_value_type: ['Section Break', 'Column Break', 'HTML', 'Table',
 	'Button', 'Image', 'Fold', 'Heading'],

	layout_fields: ['Section Break', 'Column Break', 'Fold'],

	std_fields_list: ['name', 'owner', 'creation', 'modified', 'modified_by',
		'_user_tags', '_comments', '_assign', '_starred_by', 'docstatus',
		'parent', 'parenttype', 'parentfield', 'idx'],

	std_fields: [
		{fieldname:'name', fieldtype:'Link', label:__('ID')},
		{fieldname:'owner', fieldtype:'Data', label:__('Created By')},
		{fieldname:'idx', fieldtype:'Int', label:__('Index')},
		{fieldname:'creation', fieldtype:'Date', label:__('Created On')},
		{fieldname:'modified', fieldtype:'Date', label:__('Last Updated On')},
		{fieldname:'modified_by', fieldtype:'Data', label:__('Last Updated By')},
		{fieldname:'_user_tags', fieldtype:'Data', label:__('Tags')},
		{fieldname:'_starred_by', fieldtype:'Data', label:__('Starred By')},
		{fieldname:'_comments', fieldtype:'Text', label:__('Comments')},
		{fieldname:'_assign', fieldtype:'Text', label:__('Assigned To')},
		{fieldname:'docstatus', fieldtype:'Int', label:__('Document Status')},
	],

	std_fields_table: [
		{fieldname:'parent', fieldtype:'Data', label:__('Parent')},
	],

	new_names: {},
	events: {},

	init: function() {
		// setup refresh if the document is updated somewhere else
		frappe.realtime.on("doc_update", function(data) {
			// set list dirty
			frappe.views.set_list_as_dirty(data.doctype);
			var doc = locals[data.doctype] && locals[data.doctype][data.name];
			if(doc) {
				// current document is dirty, show message if its not me
				if(cur_frm.doc.doctype===doc.doctype && cur_frm.doc.name===doc.name) {
					if(!frappe.ui.form.is_saving && data.modified!=cur_frm.doc.modified) {
						doc.__needs_refresh = true;
						cur_frm.show_if_needs_refresh();
					}
				} else {
					if(!doc.__unsaved) {
						// no local changes, remove from locals
						frappe.model.remove_from_locals(doc.doctype, doc.name);
					} else {
						// show message when user navigates back
						doc.__needs_refresh = true;
					}
				}
			}
		});

		frappe.realtime.on("list_update", function(data) {
			frappe.views.set_list_as_dirty(data.doctype);
		});

	},

	is_value_type: function(fieldtype) {
		// not in no-value type
		return frappe.model.no_value_type.indexOf(fieldtype)===-1;
	},

	get_std_field: function(fieldname) {
		var docfield = $.map([].concat(frappe.model.std_fields).concat(frappe.model.std_fields_table),
			function(d) {
				if(d.fieldname==fieldname) return d;
			});
		if(!docfield.length) {
			msgprint(__("Unknown Column: {0}", [fieldname]));
		}
		return docfield[0];
	},

	with_doctype: function(doctype, callback) {
		if(locals.DocType[doctype]) {
			callback();
		} else {
			var cached_timestamp = null;
			if(localStorage["_doctype:" + doctype]) {
				var cached_doc = JSON.parse(localStorage["_doctype:" + doctype]);
				cached_timestamp = cached_doc.modified;
			}
			return frappe.call({
				method:'frappe.desk.form.load.getdoctype',
				type: "GET",
				args: {
					doctype: doctype,
					with_parent: 1,
					cached_timestamp: cached_timestamp
				},
				freeze: true,
				callback: function(r) {
					if(r.exc) {
						msgprint(__("Unable to load: {0}", [__(doctype)]));
						throw "No doctype";
						return;
					}
					if(r.message=="use_cache") {
						frappe.model.sync(cached_doc);
					} else {
						localStorage["_doctype:" + doctype] = JSON.stringify(r.docs);
					}
					frappe.model.init_doctype(doctype);
					frappe.defaults.set_user_permissions(r.user_permissions);
					callback(r);
				}
			});
		}
	},

	init_doctype: function(doctype) {
		var meta = locals.DocType[doctype];
		if(meta.__list_js) {
			eval(meta.__list_js);
		}
		if(meta.__calendar_js) {
			eval(meta.__calendar_js);
		}
		if(meta.__map_js) {
			eval(meta.__map_js);
		}
	},

	with_doc: function(doctype, name, callback) {
		if(!name) name = doctype; // single type
		if(locals[doctype] && locals[doctype][name] && frappe.model.get_docinfo(doctype, name)) {
			callback(name);
		} else {
			return frappe.call({
				method: 'frappe.desk.form.load.getdoc',
				type: "GET",
				args: {
					doctype: doctype,
					name: name
				},
				freeze: true,
				callback: function(r) { callback(name, r); }
			});
		}
	},

	get_docinfo: function(doctype, name) {
		return frappe.model.docinfo[doctype] && frappe.model.docinfo[doctype][name] || null;
	},

	new_comment: function(comment) {
		var reference_doctype = comment.comment_doctype || comment.reference_doctype;
		var reference_name = comment.comment_docname || comment.reference_name;

		if (frappe.model.docinfo[reference_doctype] && frappe.model.docinfo[reference_doctype][reference_name]) {
			var comments = frappe.model.docinfo[reference_doctype][reference_name].comments;
			var comment_exists = false;
			for (var i=0, l=comments.length; i<l; i++) {
				if (comments[i].name==comment.name) {
					comment_exists = true;
					break;
				}
			}

			if (!comment_exists) {
				 frappe.model.docinfo[reference_doctype][reference_name].comments = comments.concat([comment]);
			}
		}
		if (cur_frm.doctype === reference_doctype && cur_frm.docname === reference_name) {
			cur_frm.comments.refresh();
		}
	},

	get_shared: function(doctype, name) {
		return frappe.model.get_docinfo(doctype, name).shared;
	},

	get_server_module_name: function(doctype) {
		var dt = frappe.model.scrub(doctype);
		var module = frappe.model.scrub(locals.DocType[doctype].module);
		var app = frappe.boot.module_app[module];
		return app + "." + module + '.doctype.' + dt + '.' + dt;
	},

	scrub: function(txt) {
		return txt.replace(/ /g, "_").toLowerCase();
	},

	can_create: function(doctype) {
		return frappe.boot.user.can_create.indexOf(doctype)!==-1;
	},

	can_read: function(doctype) {
		return frappe.boot.user.can_read.indexOf(doctype)!==-1;
	},

	can_write: function(doctype) {
		return frappe.boot.user.can_write.indexOf(doctype)!==-1;
	},

	can_get_report: function(doctype) {
		return frappe.boot.user.can_get_report.indexOf(doctype)!==-1;
	},

	can_delete: function(doctype) {
		if(!doctype) return false;
		return frappe.boot.user.can_delete.indexOf(doctype)!==-1;
	},

	can_cancel: function(doctype) {
		if(!doctype) return false;
		return frappe.boot.user.can_cancel.indexOf(doctype)!==-1;
	},

	is_submittable: function(doctype) {
		if(!doctype) return false;
		return locals.DocType[doctype] && locals.DocType[doctype].is_submittable;
	},

	is_table: function(doctype) {
		if(!doctype) return false;
		return locals.DocType[doctype] && locals.DocType[doctype].istable;
	},

	is_single: function(doctype) {
		if(!doctype) return false;
		return locals.DocType[doctype] && locals.DocType[doctype].issingle;
	},

	can_import: function(doctype, frm) {
		// system manager can always import
		if(user_roles.indexOf("System Manager")!==-1) return true;

		if(frm) return frm.perm[0].import===1;
		return frappe.boot.user.can_import.indexOf(doctype)!==-1;
	},

	can_export: function(doctype, frm) {
		// system manager can always export
		if(user_roles.indexOf("System Manager")!==-1) return true;

		if(frm) return frm.perm[0].export===1;
		return frappe.boot.user.can_export.indexOf(doctype)!==-1;
	},

	can_print: function(doctype, frm) {
		if(frm) return frm.perm[0].print===1;
		return frappe.boot.user.can_print.indexOf(doctype)!==-1;
	},

	can_email: function(doctype, frm) {
		if(frm) return frm.perm[0].email===1;
		return frappe.boot.user.can_email.indexOf(doctype)!==-1;
	},

	can_share: function(doctype, frm) {
		if(frm) {
			return frm.perm[0].share===1;
		}
		return frappe.boot.user.can_share.indexOf(doctype)!==-1;
	},

	can_set_user_permissions: function(doctype, frm) {
		// system manager can always set user permissions
		if(user_roles.indexOf("System Manager")!==-1) return true;

		if(frm) return frm.perm[0].set_user_permissions===1;
		return frappe.boot.user.can_set_user_permissions.indexOf(doctype)!==-1;
	},

	has_value: function(dt, dn, fn) {
		// return true if property has value
		var val = locals[dt] && locals[dt][dn] && locals[dt][dn][fn];
		var df = frappe.meta.get_docfield(dt, fn, dn);

		if(df.fieldtype=='Table') {
			var ret = false;
			$.each(locals[df.options] || {}, function(k,d) {
				if(d.parent==dn && d.parenttype==dt && d.parentfield==df.fieldname) {
					ret = true;
					return false;
				}
			});
		} else {
			var ret = !is_null(val);
		}
		return ret ? true : false;
	},

	get_list: function(doctype, filters) {
		var docsdict = locals[doctype] || locals[":" + doctype] || {};
		if($.isEmptyObject(docsdict))
			return [];
		return frappe.utils.filter_dict(docsdict, filters);
	},

	get_value: function(doctype, filters, fieldname, callback) {
		if(callback) {
			frappe.call({
				method:"frappe.client.get_value",
				args: {
					doctype: doctype,
					fieldname: fieldname,
					filters: filters
				},
				callback: function(r) {
					if(!r.exc) {
						callback(r.message);
					}
				}
			});
		} else {
			if(typeof filters==="string" && locals[doctype] && locals[doctype][filters]) {
				return locals[doctype][filters][fieldname];
			} else {
				var l = frappe.get_list(doctype, filters);
				return (l.length && l[0]) ? l[0][fieldname] : null;
			}
		}
	},

	set_value: function(doctype, docname, fieldname, value, fieldtype) {
		/* help: Set a value locally (if changed) and execute triggers */
		var doc = locals[doctype] && locals[doctype][docname];

		if(doc && doc[fieldname] !== value) {
			doc[fieldname] = value;
			frappe.model.trigger(fieldname, value, doc);
			return true;
		} else {
			// execute link triggers (want to reselect to execute triggers)
			if(fieldtype=="Link") {
				frappe.model.trigger(fieldname, value, doc);
			}
		}
	},

	on: function(doctype, fieldname, fn) {
		/* help: Attach a trigger on change of a particular field.
		To trigger on any change in a particular doctype, use fieldname as "*"
		*/
		/* example: frappe.model.on("Customer", "age", function(fieldname, value, doc) {
		  if(doc.age < 16) {
		    msgprint("Warning, Customer must atleast be 16 years old.");
		    raise "CustomerAgeError";
		  }
		}) */
		frappe.provide("frappe.model.events." + doctype);
		if(!frappe.model.events[doctype][fieldname]) {
			frappe.model.events[doctype][fieldname] = [];
		}
		frappe.model.events[doctype][fieldname].push(fn);
	},

	trigger: function(fieldname, value, doc) {

		var run = function(events, event_doc) {
			$.each(events || [], function(i, fn) {
				fn && fn(fieldname, value, event_doc || doc);
			});
		};

		if(frappe.model.events[doc.doctype]) {

			// field-level
			run(frappe.model.events[doc.doctype][fieldname]);

			// doctype-level
			run(frappe.model.events[doc.doctype]['*']);
		};
	},

	get_doc: function(doctype, name) {
		if(!name) name = doctype;
		if($.isPlainObject(name)) {
			var doc = frappe.get_list(doctype, name);
			return doc && doc.length ? doc[0] : null;
		}
		return locals[doctype] ? locals[doctype][name] : null;
	},

	get_children: function(doctype, parent, parentfield, filters) {
		if($.isPlainObject(doctype)) {
			var doc = doctype;
			var filters = parentfield
			var parentfield = parent;
		} else {
			var doc = frappe.get_doc(doctype, parent);
		}

		var children = doc[parentfield] || [];
		if(filters) {
			return frappe.utils.filter_dict(children, filters);
		} else {
			return children;
		}
	},

	clear_table: function(doc, parentfield) {
		for (var i=0, l=(doc[parentfield] || []).length; i<l; i++) {
			var d = doc[parentfield][i];
			delete locals[d.doctype][d.name];
		}
		doc[parentfield] = [];
	},

	remove_from_locals: function(doctype, name) {
		this.clear_doc(doctype, name);
		if(frappe.views.formview[doctype]) {
			delete frappe.views.formview[doctype].frm.opendocs[name];
		}
	},

	clear_doc: function(doctype, name) {
		var doc = locals[doctype] && locals[doctype][name];
		if(!doc) return;

		var parent = null;
		if(doc.parenttype) {
			var parent = doc.parent,
				parenttype = doc.parenttype,
				parentfield = doc.parentfield;
		}
		delete locals[doctype][name];
		if(parent) {
			var parent_doc = locals[parenttype][parent];
			var newlist = [], idx = 1;
			$.each(parent_doc[parentfield], function(i, d) {
				if(d.name!=name) {
					newlist.push(d);
					d.idx = idx;
					idx++;
				}
				parent_doc[parentfield] = newlist;
			});
		}

		if(frappe.ui.toolbar.recent)
			frappe.ui.toolbar.recent.remove(doctype, docname);
	},

	get_no_copy_list: function(doctype) {
		var no_copy_list = ['name','amended_from','amendment_date','cancel_reason'];

		var docfields = frappe.get_doc("DocType", doctype).fields || [];
		for(var i=0, j=docfields.length; i<j; i++) {
			var df = docfields[i];
			if(cint(df.no_copy)) no_copy_list.push(df.fieldname);
		}

		return no_copy_list;
	},

	delete_doc: function(doctype, docname, callback) {
		frappe.confirm(__("Permanently delete {0}?", [docname]), function() {
			return frappe.call({
				method: 'frappe.client.delete',
				args: {
					doctype: doctype,
					name: docname
				},
				callback: function(r, rt) {
					if(!r.exc) {
						frappe.model.clear_doc(doctype, docname);
						if(callback) callback(r,rt);
					}
				}
			})
		})
	},

	rename_doc: function(doctype, docname, callback) {
		var d = new frappe.ui.Dialog({
			title: __("Rename {0}", [__(docname)]),
			fields: [
				{label:__("New Name"), fieldname: "new_name", fieldtype:"Data", reqd:1, "default": docname},
				{label:__("Merge with existing"), fieldtype:"Check", fieldname:"merge"},
			]
		});
		d.set_primary_action(__("Rename"), function() {
			var args = d.get_values();
			if(!args) return;
			return frappe.call({
				method:"frappe.model.rename_doc.rename_doc",
				args: {
					doctype: doctype,
					old: docname,
					"new": args.new_name,
					"merge": args.merge
				},
				btn: d.get_primary_btn(),
				callback: function(r,rt) {
					if(!r.exc) {
						$(document).trigger('rename', [doctype, docname,
							r.message || args.new_name]);
						if(locals[doctype] && locals[doctype][docname])
							delete locals[doctype][docname];
						d.hide();
						if(callback)
							callback(r.message);
					}
				}
			});
		});
		d.show();
	},

	round_floats_in: function(doc, fieldnames) {
		if(!fieldnames) {
			fieldnames = frappe.meta.get_fieldnames(doc.doctype, doc.parent,
				{"fieldtype": ["in", ["Currency", "Float"]]});
		}
		for(var i=0, j=fieldnames.length; i < j; i++) {
			var fieldname = fieldnames[i];
			doc[fieldname] = flt(doc[fieldname], precision(fieldname, doc));
		}
	},

	validate_missing: function(doc, fieldname) {
		if(!doc[fieldname]) {
			frappe.throw(__("Please specify") + ": " +
				__(frappe.meta.get_label(doc.doctype, fieldname, doc.parent || doc.name)));
		}
	},

	get_all_docs: function(doc) {
		var all = [doc];
		for(key in doc) {
			if($.isArray(doc[key])) {
				var children = doc[key];
				for (var i=0, l=children.length; i < l; i++) {
					all.push(children[i]);
				}
			}
		}
		return all;
	}
});

// legacy
frappe.get_doc = frappe.model.get_doc;
frappe.get_children = frappe.model.get_children;
frappe.get_list = frappe.model.get_list;

var getchildren = function(doctype, parent, parentfield) {
	var children = [];
	$.each(locals[doctype] || {}, function(i, d) {
		if(d.parent === parent && d.parentfield === parentfield) {
			children.push(d);
		}
	});
	return children;
}
